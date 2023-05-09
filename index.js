const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const crypto = require('crypto');
const { Server } = require('socket.io');
const io = new Server(server);

var users = {};

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log('Client connected : ' + socket.id);
    var id = crypto.randomUUID();
    var username = '';
    var channel = '';
    var typingTO = false;

    var sendUserJoin = (channel, id, username) => {
        socket.to(channel).emit('userJoin', { 'id' : id, 'username' : username });
    }

    var sendUserLeft = (channel, id, username) => {
        socket.to(channel).emit('userLeft', { 'id' : id, 'username' : username });
    }

    var updateUsersList = (channel, id, username, isRemoving = false) => {
        if (!channel || !id) {
            return;
        }

        if (isRemoving) {
            delete users[channel][id];
        } else {
            if (users[channel] === undefined) {
                users[channel] = {};
            }
            users[channel][id] = username;
        }

        io.sockets.in(channel).emit('updateUsers', { 'users' : users[channel] });
    }

    socket.on('joinChannel', (data) => {
        username = data.username;
        channel = data.channel;
        console.log(username + ' joined channel ' + channel);
        socket.join(channel);
        sendUserJoin(channel, id, username);
        updateUsersList(channel, id, username);
    });

    socket.on('changeChannel', (newChannel) => {
        console.log(username + ' switched to channel ' + newChannel);
        sendUserLeft(channel, id, username);
        updateUsersList(channel, id, username, true);
        socket.leave(channel);

        channel = newChannel;

        socket.join(channel);
        sendUserJoin(channel, id, username);
        updateUsersList(channel, id, username);
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
        sendUserLeft(channel, id, username);
        updateUsersList(channel, id, username, true);
    });
});

server.listen(3000, () => {
    console.log('Server listening on port 3000');
});
