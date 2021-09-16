"use strict";

var socket = null;
const DefaultSongText = 'Select a station';
const DefaultMpdErrorText = 'Trying to reconnect...';
var lastMpdReconnectAttempt = 0;

Vue.component('radio-station', {
    props: ['station']
})  

var app = new Vue({
    el: '#app',
    data: {
        stationList: [ ],
        status: 'loading', // playing, stopped, paused
        song: DefaultSongText,
        currentStation: null,
        currentFile: null,
        errorState: {
            wssDisconnect: true,
            mpdServerDisconnect: true 
        },
        sliderValue: 100,
        storedsliderValue: 100
    },
    created: function () {
        this.connectWSS();
    },
    methods: {
        connectWSS: function() {
            var self = this;

            // Connect to WebSocket server
            var url = 'ws://'+location.hostname+(location.port ? ':'+location.port: '');
            socket = new ReconnectingWebSocket(url, null, {reconnectInterval: 3000});

            socket.onopen = function () {
                self.errorState.wssDisconnect = false;
                self.sendWSSMessage('REQUEST_STATION_LIST', null);
                self.sendWSSMessage('REQUEST_STATUS', null);
            };

            socket.onmessage = function (message) {
                self.errorState.wssDisconnect = false;
                var msg = JSON.parse(message.data);
                switch(msg.type) {
                    case "STATION_LIST":
                        self.stationList = msg.data;
                        if(!self.currentStation && self.currentFile)
                            self.setCurrentStation(self.currentFile);
                        break;
                    case "STATUS":
                        self.setPlayState(msg.data.state);
                        self.setCurrentStation(msg.data.file, msg.data.name || '');
                        self.setSongName(msg.data.title, msg.data.album, msg.data.artist);
                        break;
                    case "MPD_OFFLINE":
                        self.status = 'loading';
                        self.currentStation = null;
                        self.currentFile = null;
                        self.song = DefaultMpdErrorText;
                        self.errorState.mpdServerDisconnect = true;
                        setTimeout(() => {
                            if((Date.now()-lastMpdReconnectAttempt) >= 2500) {
                                lastMpdReconnectAttempt = Date.now();
                                self.sendWSSMessage('REQUEST_STATUS', null);
                            }
                        }, 3000);
                        return;
                }

                self.errorState.mpdServerDisconnect = false;
            };

            socket.onerror = socket.onclose = function(err) {
                self.errorState.wssDisconnect = true;
            };
        },

        onPlayButton: function(event) {
            var self = this;
            switch(self.status) {
                case 'playing':
                    self.status = 'loading';
                    self.sendWSSMessage('PAUSE', null);
                    break;
                case 'stopped':
                case 'paused':
                    self.status = 'loading';
                    self.sendWSSMessage('PLAY', null);
                    break;
                default:
                    self.sendWSSMessage('REQUEST_STATUS', null);
                    break;
            }
        },

        onPlayStation: function(stream) {
            var self = this;
            self.status = 'loading';
            self.currentStation = null;
            self.song = "";
            self.sendWSSMessage('PLAY', { stream: stream });
        },

        setPlayState: function(state) {
            switch(state) {
                case 'play':
                    this.status = 'playing';
                    break;
                case 'stop':
                    this.status = 'stopped';
                    break;
                case 'pause':
                    this.status = 'paused';
                    break;
                default:
                    this.status = 'loading';
                    break;
            }
        },

        setCurrentStation: function(file, fallback) {
            var self = this;
            var found = false;
            self.currentFile = file;
            self.stationList.forEach(station => {
                if(station.stream === file) {
                    found = true;
                    // Don't do anything if the station did not chnage
                    if(!self.currentStation || self.currentStation.stream !== file)
                        self.currentStation = station.station;
                    return;
                }
            });
            if(!found) {
                self.currentStation = fallback;
            }
        },

        setSongName: function(title, album, artist) {
            if(!title && !album && !artist && !this.currentStation) {
                this.song = DefaultSongText;
            } else {
                var text = '';
                if(typeof artist != 'undefined' && artist.length > 0) {
                    text = artist;
                }
                if(typeof album != 'undefined' && album.length > 0) {
                    text += ((text.length > 0) ? ' - ' : '') + album;
                }
                if(typeof title != 'undefined' && title.length > 0) {
                    text += ((text.length > 0) ? ' - ' : '') + title;
                }
                this.song = text;
            }
        },
        
        changeVolume: function() {
            var self = this;
            self.sendWSSMessage('CHANGEVOL', { volref: this.sliderValue });
        },

        sendWSSMessage: function(type, data) {
            var self = this;
            var msg = {
                type: type,
                data: (data) ? data : {}
            }
            try {
                socket.send(JSON.stringify(msg));
            } catch (error) {
                self.errorState.wssDisconnect = true;
            }
        }
    }
})
