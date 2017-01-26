import torrentStream from 'torrent-stream'
import http from 'http'
import fs from 'fs'
import rangeParser from 'range-parser'
import url from 'url'
import mime from 'mime'
import pump from 'pump'
import numeral from 'numeral'
import { exec } from 'child_process'
import EventEmitter from 'events'

class TorrentStreamVLC extends EventEmitter {
  constructor(props) {
    super()
  }

  // start stream with torrent magnet link
  startStream(index) {
    this.engine = torrentStream(this.torrent)
    this.engine.on('ready', () => {
      this.engine.server = this.createStreamServer(index)
      this.engine.server.listen(0, 'localhost')
      this.engine.listen()

      let hotswaps = 0
      let verified = 0
      let invalid = 0
      let downloadedPercentage = 0
      let streamStartTime = Date.now()

      this.engine.on('verify', () => {
        verified++

        if (this.engine.torrent) {
          let streamLength = 0
          let torrent = this.engine.torrent
          if (this.engine.torrent.files.length > 0) {
            let difference = torrent.length - torrent.files[index].length
            streamLength = torrent.length - difference
          } else {
            streamLength = torrent.length
          }
          downloadedPercentage = Math.floor(this.engine.swarm.downloaded * 100 / streamLength)
        }
      })
      this.engine.on('invalid-piece', () => {
        invalid++
      })
      this.engine.on('hotswap', () => {
        hotswaps++
      })
      this.engine.server.on('listening', () => {
        // this.engine.files[index].select()        
        this.startVLC()
        const logStatus = () => {
          let unchoked = this.engine.swarm.wires.filter(wire => {
            return !wire.peerChoking
          })
          let streamRuntime = Math.floor((Date.now() - streamStartTime) / 1000)

          let status = {
            downloadSpeed: this.getFormattedByteNumber(this.engine.swarm.downloadSpeed()),
            uploadSpeed: this.getFormattedByteNumber(this.engine.swarm.uploadSpeed()),
            downloadedSize: this.getFormattedByteNumber(this.engine.swarm.downloaded),
            uploadedSize: this.getFormattedByteNumber(this.engine.swarm.uploaded),
            downloadedPercentage,
            peersActive: unchoked.length,
            peersAvailable: this.engine.swarm.wires.length,
            streamRuntime,
            hotswaps,
            verified,
            invalid,
            queued: this.engine.swarm.queued
          }
          this.emit('stream-status', status)
        }

        this.interval = setInterval(logStatus, 500)
        logStatus()
      })

      this.engine.server.once('error', () => {
        this.engine.server.listen(0, 'localhost')
      })
    })
  }

  // format byte number for readable log output
  getFormattedByteNumber(number) {
    return numeral(number).format('0.0b')
  }

  // get a list of possible stream targets
  getFileList(torrent) {
    return new Promise((resolve, reject) => {
      this.torrent = torrent
      let isTorrent = false
      if (this.torrent.indexOf('magnet:?') > -1) {
        isTorrent = true
      } else if (/(?:\.([^.]+))?$/.exec(this.torrent)[1] == 'torrent') {
        isTorrent = true
        this.torrent = fs.readFileSync(torrent)
      }

      if (isTorrent) {
        this.engine = torrentStream(this.torrent);
        this.engine.on('ready', () => {
          let choices = this.engine.files.map((file, index) => {
            return {
              name: file.name,
              size: this.getFormattedByteNumber(file.length),
              value: index
            }
          })
          this.engine.destroy(() => {
            resolve(choices)
          })
        })
      } else {
        reject('Invalid input: no magnet link or torrent was inserted')
      }
    });
  }

  // destroys engine, removes files, exits stream process
  destroyTorrent() {
    if (this.interval) clearInterval(this.interval)
    if (this.engine.server) this.engine.server.close()
    this.engine.remove(() => {
      this.engine.destroy(() => {
        this.emit('stream-aborted')
      })
    })
  }

  // start VLC process pointing to stream server
  startVLC() {
    const href = 'http://localhost:' + this.engine.server.address().port + '/.m3u'
    const root = '/Applications/VLC.app/Contents/MacOS/VLC'
    const home = (process.env.HOME || '') + root
    const vlc = exec('vlc --video-on-top --play-and-exit ' + href + ' || ' + root + ' ' + href, (error, stdout, stderror) => {
      if (error) process.exit(0)
    })

    vlc.on('exit', () => {
      this.destroyTorrent()
    })

    this.emit('stream-ready', {
      href, 
      storagePath: this.engine.path
    })
  }

  // creates a stream server for vlc requests
  createStreamServer(index) {
    let server = http.createServer()
    let getType = mime.lookup.bind(mime)
    server.on('request', (request, response) => {
      let u = url.parse(request.url)
      let host = 'localhost'
      let file = this.engine.files[index]
      let range = request.headers.range

      let toJSON = () => {
        let totalPeers = this.engine.swarm.wires
        let activePeers = totalPeers.filter(wire => {
          return !wire.peerChoking
        })

        let swarmStats = {
          downloaded: this.engine.swarm.downloaded,
          uploaded: this.engine.swarm.uploaded,
          downloadSpeed: parseInt(this.engine.swarm.downloadSpeed(), 10),
          uploadSpeed: parseInt(this.engine.swarm.uploadSpeed(), 10),
          totalPeers: totalPeers.length,
          activePeers: activePeers.length
        }

        return JSON.stringify(swarmStats, null, '  ')
      }

      if (request.method === 'OPTIONS' && request.headers['access-control-request-headers']) {
        response.setHeader('Access-Control-Allow-Origin', request.headers.origin)
        response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        response.setHeader(
            'Access-Control-Allow-Headers',
            request.headers['access-control-request-headers'])
        response.setHeader('Access-Control-Max-Age', '1728000')

        response.end()
        return
      }

      if (request.headers.origin) response.setHeader('Access-Control-Allow-Origin', request.headers.origin)

      if (u.pathname === '/favicon.ico') {
        response.statusCode = 404
        response.end()
        return
      }

      if (u.pathname === '/.json') {
        let json = toJSON()
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Content-Length', Buffer.byteLength(json))
        response.end(json)
        return
      }

      if (u.pathname === '/.m3u') {
        let playlist = '#EXTM3U\n#EXTINF:-1,' + file.path + '\n' + 'http://localhost:' + this.engine.server.address().port
        response.setHeader('Content-Type', 'application/x-mpegurl; charset=utf-8')
        response.setHeader('Content-Length', Buffer.byteLength(playlist))
        response.end(playlist)
        return
      }

      range = range && rangeParser(file.length, range)[0]
      response.setHeader('Accept-Ranges', 'bytes')
      response.setHeader('Content-Type', getType(file.name))
      response.setHeader('transferMode.dlna.org', 'Streaming')
      response.setHeader('contentFeatures.dlna.org', 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=017000 00000000000000000000000000')
      if (!range) {
        response.setHeader('Content-Length', file.length)
        if (request.method === 'HEAD') return response.end()
        pump(file.createReadStream(), response)
        return
      }

      response.statusCode = 206
      response.setHeader('Content-Length', range.end - range.start + 1)
      response.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + file.length)
      if (request.method === 'HEAD') return response.end()
      pump(file.createReadStream(range), response)
    })

    server.on('connection', socket => {
      socket.setTimeout(36000000)
    })

    return server
  }
}

export default TorrentStreamVLC