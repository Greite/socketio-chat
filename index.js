const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const crypto = require('crypto');
const { Server } = require('socket.io');
const io = new Server(server);

var users = {};
var messages = {};

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log('Client connected : ' + socket.id);
    var id = crypto.randomUUID();
    var username = '';
    var channel = '';
    var lastMessage = '';
    var typingTO = false;
    var wizzTO = false;

    var sendUserJoin = (channel, id, username) => {
        updateMessagesList(channel, username + ' joined the game');
        socket.to(channel).emit('userJoin', { 'id' : id, 'username' : username });
    }

    var sendUserLeft = (channel, id, username) => {
        updateMessagesList(channel, username + ' left the game');
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

    var updateMessagesList = (channel, message) => {
        if (!channel || !message) {
            return;
        }

        if (messages[channel] === undefined) {
            messages[channel] = [];
        }

        messages[channel].push(message);
    }

    var sendMessagesHistory = (channel) => {
        console.log('History of channel ' + channel + ' sent to ' + username);
        io.to(socket.id).emit('messagesHistory', { 'messages' : messages[channel] });
    }

    socket.on('joinChannel', (data) => {
        username = data.username;
        channel = data.channel;
        usernameAlreadyExist = false;

        for (const channel in users) {
            for (const userID in users[channel]) {
                if (users[channel][userID] !== username) {
                    continue;
                }

                usernameAlreadyExist = true;
                break;
            }
        }

        if (usernameAlreadyExist) {
            console.log(username + ' already exist');
            io.to(socket.id).emit('usernameAlreadyExist');
            return;
        }

        console.log(username + ' joined channel ' + channel);
        socket.join(channel);
        io.to(socket.id).emit('connected');
        sendUserJoin(channel, id, username);
        sendMessagesHistory(channel);
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
        sendMessagesHistory(channel);
        updateUsersList(channel, id, username);
    });

    socket.on('getLastMessage', () => {
        io.to(socket.id).emit('lastMessageSent', lastMessage);
    })

    socket.on('sendMessage', (message) => {
        console.log('Message : ' + message);
        socket.to(channel).emit('receiveMessage', username + ' : ' + message);
        updateMessagesList(channel, username + ' : ' + message);
        lastMessage = message;
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

    socket.on('sendWizz', () => {
        if (wizzTO) {
            return;
        }

        socket.to(channel).emit('wizz');

        setTimeout(function () {
            wizzTO = false;
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
