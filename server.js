import { envs } from './config.js';
import { ethers } from 'ethers';
import { createRequire } from 'module';
import * as gameConstants from './logic/params.js';
import * as battleLogic from './logic/battle.js';

const require = createRequire(import.meta.url);

const express = require('express');
var cors = require('cors');
var expressApp = express();
expressApp.use(cors());

const http = require('http');
const port = parseInt(process.env.PORT) || 4000;
const server = http.createServer(expressApp);
const socketIo = require('socket.io');
const interval = 1000/20;

server.listen(port);
console.log(`Listening on port ${port}`);

const url = 'https://rpc.testnet.fantom.network/';
const ftmProvider = new ethers.providers.JsonRpcProvider(url);
const wallet = new ethers.Wallet(envs.PRIVKEY, ftmProvider);

const verifierABI = require('./contractABIs/verifier.json');
const duelABI = require('./contractABIs/duel.json');
const nftABI = require('./contractABIs/nft.json');

const verifier = new ethers.Contract(envs.TESTVERIFIER, verifierABI, wallet);
const duelContract = new ethers.Contract('0x61F814104Ea8cC6968aC643E8B05358A24bFf516', duelABI, wallet);
const nftContract = new ethers.Contract('0x340B62591a489CDe3906690e59a3b4D154024B32', nftABI, wallet);

const admin = require('firebase-admin');
const serviceAccount = require('./wcgame-firebase-key');

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://wcgame-default-rtdb.firebaseio.com"
})

const db = admin.firestore();

//Game State Data
const duelData = [];
let duelIndex = 0;
const duelByWallet = {};

duelContract.on('DuelStarted', async (matchInfo, nameA, nameB) => {
  const currentIndex = duelIndex.valueOf();
  duelIndex++;

  const startTime = Date.now();

  const A = [];
  const B = [];

  const matchSize = matchInfo.a.length;
  const onChainIndex = await duelContract._matchesCount();

  const ownerA = matchInfo.addressA.toLowerCase();
  const ownerB = matchInfo.addressB.toLowerCase();

  duelByWallet[ownerA.toLowerCase()] = currentIndex;
  duelByWallet[ownerB.toLowerCase()] = currentIndex;

  const recordA = await duelContract.walletRecord(ownerA.toLowerCase());
  const recordB = await duelContract.walletRecord(ownerB.toLowerCase());

  for(let i = 0; i < matchSize; i++) {
    const statsA = await db.collection('Stats').doc(`${matchInfo.a[i].toNumber()}`).get();
    const statsB = await db.collection('Stats').doc(`${matchInfo.b[i].toNumber()}`).get();
    A.push({
      Owner: ownerA,
      TokenID: matchInfo.a[i].toNumber(),
      MaxHP: statsA.data().HP,
      Hp: statsA.data().HP,
      Att: statsA.data().ATT,
      Def: statsA.data().DEF,
      Spd: statsA.data().SPD,
      Weapons: [statsA.data().WeaponLeft,statsA.data().WeaponRight],
      Type: statsA.data().WeaponLeft,
      nextTurn: ((gameConstants.timer/statsA.data().SPD) + 8)*1000 + startTime
    });
    B.push({
      Owner: ownerB,
      TokenID: matchInfo.b[i].toNumber(),
      MaxHP: statsB.data().HP,
      Hp: statsB.data().HP,
      Att: statsB.data().ATT,
      Def: statsB.data().DEF,
      Spd: statsB.data().SPD,
      Weapons: [statsB.data().WeaponLeft,statsB.data().WeaponRight],
      Type: statsB.data().WeaponLeft,
      nextTurn: ((gameConstants.timer/statsB.data().SPD) + 8)*1000 + startTime,
      room: currentIndex
    });
    startBroadcast(currentIndex);
  }

  duelData[currentIndex] = {
    a: A,
    b: B,
    eloA: recordA.elo.toNumber(),
    eloB: recordB.elo.toNumber(),
    currentCardA: 0,
    currentCardB: 0,
    matchSize: matchSize,
    startTime: startTime,
    matchOver: false,
    index: onChainIndex.toNumber()
  };

  //console.log(JSON.stringify(duelData[duelIndex], null, 2));
});

const io = new socketIo.Server(server, {
  cors: {
    origin: [
      "http://localhost:3000"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on("connection", socket => {
  socket.userData = {};

  socket.on('setWallet', async (data) => {
    let sig = ethers.utils.splitSignature(data.signature);
    let recovered = await verifier.verifyString(data.message, sig.v, sig.r, sig.s);
    socket.userData.wallet = recovered.toLowerCase();
  });

  socket.on('sendEmote', e => {
    socket.broadcast.emit('getEmote', e);
  })

  socket.on('fetchMatch', (cb) => {
    if (duelByWallet[socket.userData.wallet] != undefined && duelData[duelByWallet[socket.userData.wallet]] != undefined) {
      console.log('found');
      socket.join(duelByWallet[socket.userData.wallet]);
      battleLogic.battleActionListener(duelData[duelByWallet[socket.userData.wallet]] ,socket, duelContract);
      if (typeof cb == 'function') cb(duelData[duelByWallet[socket.userData.wallet]]);
    }
  });

  socket.on('disconnect', () => {
    delete socket.userData;
  })
});

const startBroadcast = (room) => {
    const heartbeat = async () => {
        //Once match is cleared from memory, the loop will cease
        if (duelData[room] && !duelData[room].matchOver){
            let pack = {};

            const time =  Date.now();

            const clientList = await io.in(room).fetchSockets()
            clientList.forEach(socket => {
                socket.volatile.emit('update', {
                  time: time,
                  matchState: duelData[room]
                });
            })
            setTimeout(heartbeat, interval);
        } else if (duelData[room]){
          duelByWallet[duelData[room].a[0].Owner] = undefined;
          duelByWallet[duelData[room].b[0].Owner] = undefined;
        }
    }
    return setTimeout(heartbeat, interval);
}
