const express = require('express');
const app = express();
const fs = require('fs');
const configPath = 'config.json';
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : false;

if (config) {
    const options = {
        key: fs.readFileSync(config.key),
        cert: fs.readFileSync(config.crt),
        ca: fs.readFileSync(config.ca)
    };
    const https = require('https');
    var server = https.createServer(options, app);
} else {
    const http = require('http');
    var server = http.createServer(app);
}

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

var updateMessagesList = (channel, message) => {
    if (!channel || !message) {
        return;
    }

    if (messages[channel] === undefined) {
        messages[channel] = [];
    }

    messages[channel].push(message);
}

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

    var sendMessagesHistory = (channel) => {
        console.log('History of channel ' + channel + ' sent to ' + username);
        io.to(socket.id).emit('messagesHistory', { 'messages' : messages[channel] });
    }

    var execCommand = (prompt) => {
        let exploded = prompt.toString().trim().split(' ');
        let fn = exploded[0];
        exploded.shift();
        let args = exploded;

        if (fn in global['front'] && typeof global['front'][fn] === 'function') {
            console.log('Command runed : ' + fn);
            global['front'][fn]({
                'socket': socket,
                'username': username,
                'channel': channel,
            }, ...args);
        } else {
            console.log('Command not found : ' + fn);
            io.to(socket.id).emit('commandNotFound');
        }
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
        lastMessage = message;
        typingTO = false;

        if (message.charAt(0) === '/') {
            execCommand(message.substring(1));
        } else {
            console.log('Message : ' + message);
            socket.to(channel).emit('receiveMessage', username + ' : ' + message);
            updateMessagesList(channel, username + ' : ' + message);
        }
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

        if (fn in global['admin'] && typeof global['admin'][fn] === 'function') {
            global['admin'][fn](...args);
        } else {
            console.log('Command not found : ' + fn);
        }
    });
}

global.admin = [];
global.front = [];

global.admin.close = () => {
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

global.admin.reset = (channel) => {
    if (channel === undefined) {
        console.log('Please specify a channel you want to reset');
        return;
    }

    console.log('Reseting channel : ' + channel);
    messages[channel] = [];
    io.to(channel).emit('messagesHistory', { 'messages' : messages[channel] })
}

global.admin.kick = (username) => {
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

global.admin.ban = (username) => {
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

global.admin.unban = (username) => {
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

global.admin.banlist = () => {
    console.log(banList);
}

global.admin.list = () => {
    console.log(userList);
}

global.front.gif = (context, url) => {
    if (url === undefined) {
        io.sockets.to(context.socket.id).emit('commandError', 'Please specify the gif URL you want to display');
        return;
    }

    let message = String.raw`${context.username} : <img src="${url}" />`

    updateMessagesList(context.channel, '{{raw}}' + message);
    io.sockets.to(context.channel).emit('receiveCommand', message);
}

server.listen(3000, () => {
    console.log('Server listening on port 3000');
    readCommand();
});
