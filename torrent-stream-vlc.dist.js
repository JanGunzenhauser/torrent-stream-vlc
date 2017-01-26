'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _torrentStream = require('torrent-stream');

var _torrentStream2 = _interopRequireDefault(_torrentStream);

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _rangeParser = require('range-parser');

var _rangeParser2 = _interopRequireDefault(_rangeParser);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var _mime = require('mime');

var _mime2 = _interopRequireDefault(_mime);

var _pump = require('pump');

var _pump2 = _interopRequireDefault(_pump);

var _numeral = require('numeral');

var _numeral2 = _interopRequireDefault(_numeral);

var _child_process = require('child_process');

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var TorrentStreamVLC = function (_EventEmitter) {
  _inherits(TorrentStreamVLC, _EventEmitter);

  function TorrentStreamVLC(props) {
    _classCallCheck(this, TorrentStreamVLC);

    return _possibleConstructorReturn(this, (TorrentStreamVLC.__proto__ || Object.getPrototypeOf(TorrentStreamVLC)).call(this));
  }

  // start stream with torrent magnet link


  _createClass(TorrentStreamVLC, [{
    key: 'startStream',
    value: function startStream(index) {
      var _this2 = this;

      this.engine = (0, _torrentStream2.default)(this.torrent);
      this.engine.on('ready', function () {
        _this2.engine.server = _this2.createStreamServer(index);
        _this2.engine.server.listen(0, 'localhost');
        _this2.engine.listen();

        var hotswaps = 0;
        var verified = 0;
        var invalid = 0;
        var downloadedPercentage = 0;
        var streamStartTime = Date.now();

        _this2.engine.on('verify', function () {
          verified++;

          if (_this2.engine.torrent) {
            var streamLength = 0;
            var torrent = _this2.engine.torrent;
            if (_this2.engine.torrent.files.length > 0) {
              var difference = torrent.length - torrent.files[index].length;
              streamLength = torrent.length - difference;
            } else {
              streamLength = torrent.length;
            }
            downloadedPercentage = Math.floor(_this2.engine.swarm.downloaded * 100 / streamLength);
          }
        });
        _this2.engine.on('invalid-piece', function () {
          invalid++;
        });
        _this2.engine.on('hotswap', function () {
          hotswaps++;
        });
        _this2.engine.server.on('listening', function () {
          // this.engine.files[index].select()        
          _this2.startVLC();
          var logStatus = function logStatus() {
            var unchoked = _this2.engine.swarm.wires.filter(function (wire) {
              return !wire.peerChoking;
            });
            var streamRuntime = Math.floor((Date.now() - streamStartTime) / 1000);

            var status = {
              downloadSpeed: _this2.getFormattedByteNumber(_this2.engine.swarm.downloadSpeed()),
              uploadSpeed: _this2.getFormattedByteNumber(_this2.engine.swarm.uploadSpeed()),
              downloadedSize: _this2.getFormattedByteNumber(_this2.engine.swarm.downloaded),
              uploadedSize: _this2.getFormattedByteNumber(_this2.engine.swarm.uploaded),
              downloadedPercentage: downloadedPercentage,
              peersActive: unchoked.length,
              peersAvailable: _this2.engine.swarm.wires.length,
              streamRuntime: streamRuntime,
              hotswaps: hotswaps,
              verified: verified,
              invalid: invalid,
              queued: _this2.engine.swarm.queued
            };
            _this2.emit('stream-status', status);
          };

          _this2.interval = setInterval(logStatus, 500);
          logStatus();
        });

        _this2.engine.server.once('error', function () {
          _this2.engine.server.listen(0, 'localhost');
        });
      });
    }

    // format byte number for readable log output

  }, {
    key: 'getFormattedByteNumber',
    value: function getFormattedByteNumber(number) {
      return (0, _numeral2.default)(number).format('0.0b');
    }

    // get a list of possible stream targets

  }, {
    key: 'getFileList',
    value: function getFileList(torrent) {
      var _this3 = this;

      return new Promise(function (resolve, reject) {
        _this3.torrent = torrent;
        var isTorrent = false;
        if (_this3.torrent.indexOf('magnet:?') > -1) {
          isTorrent = true;
        } else if (/(?:\.([^.]+))?$/.exec(_this3.torrent)[1] == 'torrent') {
          isTorrent = true;
          _this3.torrent = _fs2.default.readFileSync(torrent);
        }

        if (isTorrent) {
          _this3.engine = (0, _torrentStream2.default)(_this3.torrent);
          _this3.engine.on('ready', function () {
            var choices = _this3.engine.files.map(function (file, index) {
              return {
                name: file.name,
                size: _this3.getFormattedByteNumber(file.length),
                value: index
              };
            });
            _this3.engine.destroy(function () {
              resolve(choices);
            });
          });
        } else {
          reject('Invalid input: no magnet link or torrent was inserted');
        }
      });
    }

    // destroys engine, removes files, exits stream process

  }, {
    key: 'destroyTorrent',
    value: function destroyTorrent() {
      var _this4 = this;

      if (this.interval) clearInterval(this.interval);
      if (this.engine.server) this.engine.server.close();
      this.engine.remove(function () {
        _this4.engine.destroy(function () {
          _this4.emit('stream-aborted');
        });
      });
    }

    // start VLC process pointing to stream server

  }, {
    key: 'startVLC',
    value: function startVLC() {
      var _this5 = this;

      var href = 'http://localhost:' + this.engine.server.address().port + '/.m3u';
      var root = '/Applications/VLC.app/Contents/MacOS/VLC';
      var home = (process.env.HOME || '') + root;
      var vlc = (0, _child_process.exec)('vlc --video-on-top --play-and-exit ' + href + ' || ' + root + ' ' + href, function (error, stdout, stderror) {
        if (error) process.exit(0);
      });

      vlc.on('exit', function () {
        _this5.destroyTorrent();
      });

      this.emit('stream-ready', {
        href: href,
        storagePath: this.engine.path
      });
    }

    // creates a stream server for vlc requests

  }, {
    key: 'createStreamServer',
    value: function createStreamServer(index) {
      var _this6 = this;

      var server = _http2.default.createServer();
      var getType = _mime2.default.lookup.bind(_mime2.default);
      server.on('request', function (request, response) {
        var u = _url2.default.parse(request.url);
        var host = 'localhost';
        var file = _this6.engine.files[index];
        var range = request.headers.range;

        var toJSON = function toJSON() {
          var totalPeers = _this6.engine.swarm.wires;
          var activePeers = totalPeers.filter(function (wire) {
            return !wire.peerChoking;
          });

          var swarmStats = {
            downloaded: _this6.engine.swarm.downloaded,
            uploaded: _this6.engine.swarm.uploaded,
            downloadSpeed: parseInt(_this6.engine.swarm.downloadSpeed(), 10),
            uploadSpeed: parseInt(_this6.engine.swarm.uploadSpeed(), 10),
            totalPeers: totalPeers.length,
            activePeers: activePeers.length
          };

          return JSON.stringify(swarmStats, null, '  ');
        };

        if (request.method === 'OPTIONS' && request.headers['access-control-request-headers']) {
          response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
          response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
          response.setHeader('Access-Control-Allow-Headers', request.headers['access-control-request-headers']);
          response.setHeader('Access-Control-Max-Age', '1728000');

          response.end();
          return;
        }

        if (request.headers.origin) response.setHeader('Access-Control-Allow-Origin', request.headers.origin);

        if (u.pathname === '/favicon.ico') {
          response.statusCode = 404;
          response.end();
          return;
        }

        if (u.pathname === '/.json') {
          var json = toJSON();
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Content-Length', Buffer.byteLength(json));
          response.end(json);
          return;
        }

        if (u.pathname === '/.m3u') {
          var playlist = '#EXTM3U\n#EXTINF:-1,' + file.path + '\n' + 'http://localhost:' + _this6.engine.server.address().port;
          response.setHeader('Content-Type', 'application/x-mpegurl; charset=utf-8');
          response.setHeader('Content-Length', Buffer.byteLength(playlist));
          response.end(playlist);
          return;
        }

        range = range && (0, _rangeParser2.default)(file.length, range)[0];
        response.setHeader('Accept-Ranges', 'bytes');
        response.setHeader('Content-Type', getType(file.name));
        response.setHeader('transferMode.dlna.org', 'Streaming');
        response.setHeader('contentFeatures.dlna.org', 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=017000 00000000000000000000000000');
        if (!range) {
          response.setHeader('Content-Length', file.length);
          if (request.method === 'HEAD') return response.end();
          (0, _pump2.default)(file.createReadStream(), response);
          return;
        }

        response.statusCode = 206;
        response.setHeader('Content-Length', range.end - range.start + 1);
        response.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + file.length);
        if (request.method === 'HEAD') return response.end();
        (0, _pump2.default)(file.createReadStream(range), response);
      });

      server.on('connection', function (socket) {
        socket.setTimeout(36000000);
      });

      return server;
    }
  }]);

  return TorrentStreamVLC;
}(_events2.default);

exports.default = TorrentStreamVLC;
