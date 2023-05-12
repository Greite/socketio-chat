const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const crypto = require('crypto');
const { Server } = require('socket.io');
const io = new Server(server);
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

var users = {};
var messages = {};
var banList = [];
var userList = [];

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
        usernameBanned = false;

        for (const bannedUserID in banList) {
            console.log(bannedUserID, username);
            if (banList[bannedUserID] !== username) {
                continue;
            }

            usernameBanned = true;
            break;
        }

        if (usernameBanned) {
            console.log(username + ' trying to connect but is banned !');
            io.to(socket.id).emit('usernameBanned');
            return;
        }

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

        userList[username] = socket.id;

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
        delete userList[username];
        sendUserLeft(channel, id, username);
        updateUsersList(channel, id, username, true);
    });
});

var readCommand = () => {
    readline.question('', (prompt) => {
        readCommand();
        let exploded = prompt.toString().trim().split(' ');
        let fn = exploded[0];
        exploded.shift();
        let args = exploded;

        if (fn in global && typeof global[fn] === 'function') {
            global[fn](...args);
        } else {
            console.log('Command not found : ' + fn);
        }
    });
}

global.close = () => {
    setTimeout(() => {
        console.log('Server will shutdown in 5 seconds');
        io.emit('serverCloseIn5');
    }, 1000);

    setTimeout(() => {
        console.log('Server will shutdown in 4 seconds');
        io.emit('serverCloseIn4');
    }, 2000);

    setTimeout(() => {
        console.log('Server will shutdown in 3 seconds');
        io.emit('serverCloseIn3');
    }, 3000);

    setTimeout(() => {
        console.log('Server will shutdown in 2 seconds');
        io.emit('serverCloseIn2');
    }, 4000);

    setTimeout(() => {
        console.log('Server will shutdown');
        io.emit('serverCloseIn1');
    }, 5000);

    setTimeout(() => {
        console.log('Server closed');
        io.emit('serverClosed');
        io.disconnectSockets();
        io.close();
        readline.close();
        server.close();
    }, 5500);
}

global.reset = (channel) => {
    if (channel === undefined) {
        console.log('Please specify a channel you want to reset');
        return;
    }

    console.log('Reseting channel : ' + channel);
    messages[channel] = [];
    io.to(channel).emit('messagesHistory', { 'messages' : messages[channel] })
}

global.kick = (username) => {
    if (username === undefined) {
        console.log('Please specify the user you want to kick');
        return;
    }

    console.log('User ' + username + ' kicked');

    if (userList[username] !== undefined) {
        io.to(userList[username]).emit('kicked');
    } else {
        console.log('User ' + username + ' not connected');
    }
}

global.ban = (username) => {
    if (username === undefined) {
        console.log('Please specify the user you want to ban');
        return;
    }

    if (banList.includes(username)) {
        console.log('User ' + username + ' already banned');
        return;
    }

    console.log('User ' + username + ' banned');
    banList.push(username);
    io.emit('systemBan', username);

    if (userList[username] !== undefined) {
        io.to(userList[username]).emit('banned');
    }
}

global.unban = (username) => {
    if (username === undefined) {
        console.log('Please specify the user you want to unban');
        return;
    }

    if (!banList.includes(username)) {
        console.log('User ' + username + ' not banned');
        return;
    }

    console.log('User ' + username + ' unbanned');
    banList.pop(username);
}

global.banlist = () => {
    console.log(banList);
}

server.listen(3000, () => {
    console.log('Server listening on port 3000');
    readCommand();
});
