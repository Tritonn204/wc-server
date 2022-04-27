import 'dotenv/config';
import { ethers } from 'ethers';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const express = require('express');

const http = require('http');
const port = parseInt(process.env.PORT) || 4000;
const server = http.createServer();
const socketIo = require('socket.io');

server.listen(port);
console.log(`Listening on port ${port}`);

const url = 'https://rpc.testnet.fantom.network/';
const ftmProvider = new ethers.providers.JsonRpcProvider(url);
const wallet = new ethers.Wallet(process.env.PRIVKEY, ftmProvider);
const verifierABI = require('./contractABIs/verifier.json');
const verifier = new ethers.Contract(process.env.TESTVERIFIER, verifierABI, wallet);

//Game logic import
const gameConstants = require('./logic/params.js');

//Game State Data
const duelData = [];
const duelIndex = 0;
const duelByWallet = {};

duelContract.on('DuelStarted', (AtokenID, BtokenID, addressAAddress, AddressAName, addressBAddress, addressBName, queueType, matchSize) => {
  const currentIndex = duelIndex.valueOf();
  duelIndex++;

  duelByWallet[addressAAddress] = currentIndex;
  duelByWallet[addressBAddress] = currentIndex;

  const startTime = Date.now();

  const A = []
  const B = []

  for(let i = 0; i < matchSize; i++) {
    A.push({
      Owner: addressAAddress,
      tokenId: AtokenID,
      hp: 10000,
      att: 1000,
      def: 800,
      spd: 350,
      weapons: [1,2],
      type: 1,
      nextTurn: (gameConstants.timer/350) + 8 + now
    });
    B.push({
      Owner: addressBAddress,
      tokenId: BtokenID,
      hp: 10000,
      att: 1000,
      def: 800,
      spd: 350,
      weapons: [2,3],
      type: 2,
      nextTurn: (gameConstants.timer/350) + 8 + now
    });
  }

  duelData[duelIndex] = {
    a: A,
    b: B,
    currentCardA: 0,
    currentCardB: 0,
    matchSize: matchSize,
    matchType: queueType,
    startTime: now,
    matchOver: false
  };
});

const io = new socketIo.Server(server, {
  cors: {
    origin: [
      "https://youthful-keller-2f50ca.netlify.app",
      "http://localhost:3000"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on("connection", socket => {
  socket.userData = {};

  socket.on('setWallet', async (data, cb) => {
    let sig = ethers.utils.splitSignature(data.signature);
    let recovered = await verifier.verifyString(data.message, sig.v, sig.r, sig.s);
    socket.userData.wallet = recovered;
    if (typeof cb == 'function' && data.wallet == recovered) cb(recovered);
  });

  socket.on('fetchMatch', (cb) => {
    cb(duelData[duelsByWallet[socket.userData.wallet]]);
  })
});
