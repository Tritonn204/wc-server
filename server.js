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
const retryInterval = 60000;

server.listen(port);
console.log(`Listening on port ${port}`);

const ftmProvider = new ethers.providers.JsonRpcProvider(envs.RPCURL);
const wallet = new ethers.Wallet(envs.PRIVKEY, ftmProvider);

const verifierABI = require('./contractABIs/verifier.json');
const duelABI = require('./contractABIs/duel.json');
const nftABI = require('./contractABIs/nft.json');

const verifier = new ethers.Contract(envs.VERIFIER, verifierABI, wallet);
const duelContract = new ethers.Contract(envs.DUELCONTRACT, duelABI, wallet);
const nftContract = new ethers.Contract(envs.NFTCONTRACT, nftABI, wallet);

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
  console.log('duel started');
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
  const glossary = await duelContract.queueGlossary(matchInfo.matchType.toNumber());

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
    aName: recordA.name,
    bName: recordB.name,
    recordA: {wins: recordA.wins.toNumber(), losses: recordA.losses.toNumber()},
    recordB: {wins: recordB.wins.toNumber(), losses: recordB.losses.toNumber()},
    nextSwapA: startTime,
    nextSwapB: startTime,
    a: A,
    b: B,
    eloA: recordA.elo.toNumber(),
    eloB: recordB.elo.toNumber(),
    currentCardA: 0,
    currentCardB: 0,
    matchSize: matchSize,
    matchType: matchInfo.matchType.toNumber(),
    startTime: startTime,
    matchOver: false,
    index: onChainIndex.toNumber(),
    currency: glossary.currency.toLowerCase()
  };

  //console.log(JSON.stringify(duelData[duelIndex], null, 2));
});

const io = new socketIo.Server(server, {
  cors: {
    origin: [
      "https://weaponizedcountriesnft.com"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on("connection", socket => {
  socket.userData = {};

  socket.on('setWallet', async (data) => {
    if (data == undefined) return;
    let sig = ethers.utils.splitSignature(data.signature);
    let recovered = await verifier.verifyString(data.message, sig.v, sig.r, sig.s);
    socket.userData = {wallet: recovered.toLowerCase()};
  });

  socket.on('sendEmote', e => {
    socket.broadcast.emit('getEmote', e);
  })

  socket.on('fetchMatch', (cb) => {
    if (duelByWallet[socket.userData.wallet] != undefined && duelData[duelByWallet[socket.userData.wallet]] != undefined) {
      console.log('found');
      socket.join(duelByWallet[socket.userData.wallet]);
      battleLogic.battleActionListener(duelData[duelByWallet[socket.userData.wallet]] ,socket, duelContract, db);
      if (typeof cb == 'function') cb(duelData[duelByWallet[socket.userData.wallet]]);
    }
  });

  socket.on('disconnect', () => {
    delete socket.userData;
  })
});

const addData = async (wins, losses, owner, name, elo) => {
  var N;
  if (name == '') {
    N = owner.substring(0, 6) + "..." + owner.slice(-4);
  } else {
    N = name;
  }
  var data = {
    Wins: wins,
    Losses: losses,
    Wallet: owner,
    Name: N,
    Elo: elo
  }
  const res = await db.collection('Leaderboard').doc(owner.toString()).set(data);
};

const startBroadcast = (room) => {
    const heartbeat = async () => {
        //Once match is cleared from memory, the loop will cease
        if (duelData[room] && duelData[room].matchClosed == undefined){
            if (duelData[room].matchOver == true) {
              try {
                var query = await db.collection('MatchTypes3').doc(`${duelData[room].currency}`).get();
                var symbol = query.data().Title;

                const query2 = db.collection(`MatchHistory_${symbol}`).doc(`Index`);
                query2.update({
                  list: admin.firestore.FieldValue.arrayUnion(`${duelData[room].index}`)
                });

                await db.collection(`MatchHistory_${symbol}`).doc(`${duelData[room].index}`).set(duelData[room]);
                await addData(duelData[room].recordA.wins, duelData[room].recordA.losses, duelData[room].a[0].Owner, duelData[room].aName, duelData[room].newEloA);
                await addData(duelData[room].recordB.wins, duelData[room].recordB.losses, duelData[room].b[0].Owner, duelData[room].bName, duelData[room].newEloB);
              } catch(e) {
                console.log(e);
              }
              duelData[room].matchClosed = true;
            }
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

setInterval(async () => {
  const query = await db.collection(`UnendedMatches`).get();
  query.forEach(async (entry) => {
    const ARGS = entry.data().args;
    try{
      const tx = await duelContract.endDuel(ARGS[0], ARGS[1], ARGS[2], ARGS[3], {gasPrice: 700000000000});
      await entry.ref.delete();
    } catch(e) {}
  })
}, retryInterval)
