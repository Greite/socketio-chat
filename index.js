const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const crypto = require('crypto');
const { Server } = require('socket.io');
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

function sendUserJoin(socket, channel, id, username) {
    socket.to(channel).emit('userJoin', { 'id' : id, 'username' : username })
}

function sendUserLeft(socket, channel, id, username) {
    socket.to(channel).emit('userLeft', { 'id' : id, 'username' : username });
}

io.on('connection', (socket) => {
    console.log('Client connected : ' + socket.id);
    var id = crypto.randomUUID();
    var username = '';
    var channel = '';
    var typingTO = false;

    socket.on('joinChannel', (data) => {
        username = data.username;
        channel = data.channel;
        console.log(username + ' joined channel ' + channel);
        socket.join(channel);
        sendUserJoin(socket, channel, id, username);
    });

    socket.on('changeChannel', (newChannel) => {
        console.log(username + ' switched to channel ' + newChannel);
        sendUserLeft(socket, channel, id, username);
        socket.leave(channel);

        channel = newChannel;

        socket.join(channel);
        sendUserJoin(socket, channel, id, username);
    });

    socket.on('sendMessage', (message) => {
        console.log('Message : ' + message);
        socket.to(channel).emit('receiveMessage', username + ' : ' + message);
        typingTO = false;
    });

    socket.on('typing', () => {
        if (typingTO) {
            return;
        }

        console.log(username + ' is typing');
        socket.to(channel).emit('isTyping', username);
        typingTO = true;

        setTimeout(function () {
            typingTO = false;
        }, 4000);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected : ' + socket.id);
        sendUserLeft(socket, channel, id, username);
    });
});

server.listen(3000, () => {
    console.log('Server listening on port 3000');
});
