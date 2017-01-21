# torrent-stream-vlc
<i>Insert magnet link to stream torrent files to VLC (VideoLAN Client)</i>

Built using <a href="https://www.npmjs.com/package/torrent-stream">torrent-stream</a> and inspired by <a href="https://www.npmjs.com/package/peerflix">peerflix</a>. Thanks to <a href="https://github.com/mafintosh">Mathias  Buus.</a>

## Prerequisites
- node (created and tested on v4.6.0)
- npm 
- VLC for Max OS X (https://www.videolan.org/vlc/download-macosx.html)

## Limitations
- only works on OS X with installed VLC player
- no option to use actual torrent file instead of magnet link

## Usage

### Initialise

    // import the module
    var TorrentStreamVLC = require('torrent-stream-vlc')
    
    // create an instance using a torrent magnet link as the input
    var torrentStreamVLC = new TorrentStreamVLC(torrent)

### List files included in torrent

    // call getFileList to output a list of choices (array) including e.g. file name and index
    torrentStreamVLC.getFileList().then(function(choices) {
      // here you need to select the file to target (video file)
      var fileIndex = 1 // the index of the targeted file

      // start the stream with target index
      torrentStreamVLC.startStream(fileIndex)
    })

### Listen to events

    // receive notification when stream is ready
    torrentStreamVLC.on('stream-ready', function(info) {
      /* info contains: 
        href (address of the stream server)
        storagePath (path to where stream data is temporarily saved)
      */
    })

    // get stream status updates every 500 ms
    torrentStreamVLC.on('stream-status', function(status) {
      /* status contains: 
        downloadSpeed (current download speed)
        uploadedSize (current upload speed)
        downloadedSize (size of already downloaded pieces)
        downloadedPercentage (percent of file downloaded)
        peersActive (connected peers)
        peersAvailable (available peers)
        streamRuntime (time the stream is already running in seconds)
        hotswaps (hotswap occurences)
        verified (verified pieces)
        invalid (invalid pieces)
        queued (queued peers)
      */
    })

    // stream-abort happens when vlc was exited
    torrentStreamVLC.on('stream-abort', function() {
      // e.g. exit the process
      process.exit(0)
    })

## Contribution & Modification
Contribute to this work by improving it or modify the package for your own needs. I recommend working with the included src file and babel:

    // install babel-cli and babel-preset-es2015
    npm run install-dev

    // run this to watch and compile new dist file
    npm run dev

    // when you're done, run this to minify dist file
    npm run dist