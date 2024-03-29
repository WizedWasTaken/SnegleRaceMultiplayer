/**
 * WebSocketService class handles the WebSocket communication between the server and clients.
 * It manages room creation, joining, leaving, sending messages, and handling drawing data.
 */
class WebSocketService {
  /**
   * Constructs a new WebSocketService instance.
   * @param {object} io - The socket.io instance.
   */
  constructor(io) {
    this.io = io;
    this.rooms = {};
  }

  /**
   * Initializes the WebSocket connection and sets up event listeners.
   */
  initializeSocket() {
    this.io.on('connection', (socket) => {
      console.log('User connected', socket.id);

      // Join Room event
      socket.on('joinRoom', (roomId, username) => {
        this.handleJoinRoom(socket, roomId, username);
      });

      // Create Room event
      socket.on('createRoom', (username) => {
        this.createRoom(socket, username);
      });

      // Message event
      socket.on('message', (username, message, roomId) => {
        this.handleMessage(username, message, roomId);
      });

      // Leave Room event
      socket.on('leaveRoom', (roomId, username) => {
        this.handleLeaveRoom(roomId, socket, username);
      });

      // Drawing Data event
      socket.on('drawingData', (data, roomId) => {
        this.handleDrawingData(data, roomId);
      });

      // Clear Canvas event
      socket.on('clearCanvas', (roomId) => {
        this.io.to(roomId).emit('clearCanvas');
      });

      // Disconnect event
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  /**
   * Handles the joinRoom event. Adds the user to the specified room and emits necessary events.
   * @param {object} socket - The socket object.
   * @param {string} roomId - The room ID.
   * @param {string} username - The username of the user.
   */
  handleJoinRoom(socket, roomId, username) {
    const MAX_PLAYERS = 15;

    if (roomId == '' || roomId == undefined) {
      socket.emit('error', 'Indtast et rum id');
      return;
    }

    if (this.rooms[roomId].users.length == MAX_PLAYERS) {
      socket.emit('error', 'Rummet har ramt maximum antal spillere.');
      return;
    }

    if (!this.rooms[roomId]) {
      socket.emit('error', `Rum "${roomId}" findes ikke.`);
      return;
    }

    const numberOfUsers = Object.keys(this.rooms[roomId].users).length;

    if (numberOfUsers >= MAX_PLAYERS) {
      console.log('Room has reached the maximum number of players.');
      socket.emit('error', 'Rummet har ramt maximum antal spillere.');
      return;
    }

    if (this.rooms[roomId].users.hasOwnProperty(socket.id)) {
      socket.emit('error', `${socket.id} er allerede i rum ${roomId}.`);
      return;
    }

    socket.join(roomId);
    let newUser = new User(socket.id, username);
    this.rooms[roomId].users[newUser.socketId] = newUser;

    this.rooms[roomId].messages.forEach((message) => {
      socket.emit('message', message);
    });

    this.handleMessage(
      'System',
      `${username} har tilsluttet sig rummet.`,
      roomId
    );

    this.io.to(roomId).emit('users', Object.values(this.rooms[roomId].users));
    socket.emit('joinedRoom', roomId);

    const usersInRoom = Object.values(this.rooms[roomId].users);
    this.io.to(roomId).emit('users', usersInRoom);
  }

  /**
   * Creates a new room and adds the user to the room.
   * @param {object} socket - The socket object.
   * @param {string} username - The username of the user.
   */
  createRoom(socket, username) {
    const roomID = this.generateRoomID();
    const user = new User(socket.id, username);
    this.rooms[roomID] = {
      host: user,
      users: { [socket.id]: user },
    };
    socket.join(roomID);
    socket.emit('room created', roomID);
    this.rooms[roomID].messages = [];
    this.handleMessage(
      'System',
      `Rum ${roomID} er blevet oprettet af ${username}.`,
      roomID
    );
    this.io.to(roomID).emit('users', Object.values(this.rooms[roomID].users));
  }

  /**
   * Generates a random room ID.
   * @returns {string} - The generated room ID.
   */
  generateRoomID() {
    return Math.random().toString(36).substring(2, 9);
  }

  /**
   * Handles the message event. Adds the message to the room and emits it to all clients in the room.
   * @param {string} username - The username of the sender.
   * @param {string} message - The message content.
   * @param {string} roomId - The room ID.
   */
  handleMessage(username, message, roomId) {
    this.rooms[roomId].messages.push({ username, message });
    this.io.to(roomId).emit('message', {
      username: username,
      message: message,
    });
  }

  /**
   * Handles the leaveRoom event. Removes the user from the room and emits necessary events.
   * @param {string} roomId - The room ID.
   * @param {object} socket - The socket object.
   * @param {string} username - The username of the user.
   */
  handleLeaveRoom(roomId, socket, username) {
    if (
      !this.rooms.hasOwnProperty(roomId) ||
      !this.rooms[roomId].users.hasOwnProperty(socket.id)
    ) {
      return;
    }

    if (socket.id === this.rooms[roomId].host.socketId) {
      this.io.to(roomId).emit('roomLeft');
      this.io.to(roomId).emit('error', 'Værten har forladt rummet.');
      delete this.rooms[roomId];
      return;
    }

    delete this.rooms[roomId].users[socket.id];
    this.io.to(roomId).emit('users', Object.values(this.rooms[roomId].users));

    this.handleMessage('System', `${username} har forladt rummet.`, roomId);
  }

  /**
   * Handles the drawingData event. Emits the drawing data to all clients in the room.
   * @param {object} data - The drawing data.
   * @param {string} roomId - The room ID.
   */
  handleDrawingData(data, roomId) {
    this.io.to(roomId).emit('drawingData', data);
  }

  /**
   * Handles the disconnect event. Removes the user from all rooms and emits necessary events.
   * @param {object} socket - The socket object.
   */
  handleDisconnect(socket) {
    if (
      this.rooms === undefined ||
      this.rooms.length === 0 ||
      this.rooms === null
    ) {
      return;
    }

    Object.keys(this.rooms).forEach((roomId) => {
      // Will probably never be used
      const room = this.rooms[roomId];
      if (room.users.hasOwnProperty(socket.id)) {
        this.handleLeaveRoom(roomId, socket, room.users[socket.id].username);
      }
    });
    socket.leaveAll();
  }
}

/**
 * User class represents a user in the WebSocketService.
 */
class User {
  /**
   * Constructs a new User instance.
   * @param {string} socketId - The socket ID of the user.
   * @param {string} username - The username of the user.
   */
  constructor(socketId, username) {
    this.socketId = socketId;
    this.username = username;
  }
}

module.exports = WebSocketService;
