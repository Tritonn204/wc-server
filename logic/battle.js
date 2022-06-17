import * as gameConstants from './params.js';

const DamageMultArray0 = [2,1,1,1];
const DamageMultArray1 = [4,2,1,4];
const DamageMultArray2 = [4,4,2,1];
const DamageMultArray3 = [4,1,4,2];
export const multArray = [DamageMultArray0,DamageMultArray1,DamageMultArray2,DamageMultArray3];

const damageBase = 1250;
const healingBase = 2;
const critCurve = 0.8;
const crit = 0.33;

export const calculateElo = (eloA, eloB, winner) => {
  var winnerElo;
  var loserElo;

  if(eloA == 0){
    eloA = 1000;
  }
  if(eloB == 0){
    eloB = 1000;
  }

  var R1 = Math.pow(10,eloA/400);
  var R2 = Math.pow(10,eloB/400);

  var E1 = R1 / (R1 + R2);
  var E2 = R2 / (R1 + R2);

  if(winner == 0){
    const Elo1 = eloA + (42 * (1 - E1));
    const Elo2 = eloB + (42 * (0 - E2));

    winnerElo = Elo1;
    loserElo = Elo2;
  } else {
    const Elo1 = eloA + (42 * (0 - E1));
    const Elo2 = eloB + (42 * (1 - E2));

    winnerElo = Elo2;
    loserElo = Elo1;
  }

  return {winnerElo: Math.round(winnerElo), loserElo: Math.round(loserElo)};
}

export const battleActionListener = (matchData, socket, battleContract, backpackContract, db) => {
  if (!matchData) return;
  if (Object.keys(matchData).length < 1) return;
  const account = socket.userData.wallet;
  socket.on('input', async (data, cb) => {
    const now = Date.now();
    if (data.action == 'attack') {
      const weaponChoice = data.weaponChoice;
      if (account == matchData.a[0].Owner) {
        if (now < matchData.a[matchData.currentCardA].nextTurn) return;
        let delta = (now - matchData.a[matchData.currentCardA].nextTurn)/1000;

        if (matchData.statusB == 1) {
          matchData.statusB = 0;
          if (typeof cb == 'function') cb({
            death: false,
            end: false,
            damage: 0,
            type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
            advantage: advantage,
            newCard: i,
            nextTurn: matchData.a[matchData.currentCardA].nextTurn,
            block: true
          });
          socket.broadcast.emit('showAttack', {
            death: true,
            end: false,
            damage: 0,
            type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
            advantage: advantage,
            newCard: i,
            nextTurn: matchData.a[matchData.currentCardA].nextTurn,
            block: true
          });
          return;
        }

        var currentCrit = 0.01 * Math.pow(1.0+(critCurve), delta);
        currentCrit = Math.min(0.33, currentCrit);

        var advantage = multArray[matchData.a[matchData.currentCardA].Weapons[weaponChoice]][matchData.b[matchData.currentCardB].Type];
        var damage = (((matchData.a[matchData.currentCardA].Att*damageBase)/matchData.b[matchData.currentCardB].Def)*advantage)*(1+currentCrit);

        matchData.a[matchData.currentCardA].nextTurn = ((((gameConstants.timer/matchData.a[matchData.currentCardA].Spd) + 8)*1000)/matchData.statusA == 2 ? 2 : 1) + now;
        if (matchData.statusA == 2) matchData.statusA = 0;

        matchData.a[matchData.currentCardA].Type = matchData.a[matchData.currentCardA].Weapons[weaponChoice];

        if (matchData.statusA == 3) {
          damage = (damage*2)/matchData.matchSize;
          matchData.statusA = 0;

          for (let i = 0; i < matchData.matchSize; i++) {
            if (matchData.b[i] != matchData.currentCardB) matchData.b[i].Hp = Math.max(matchData.b[i].Hp - damage,0);
          }
        }

        if(damage > matchData.b[matchData.currentCardB].Hp){
          if (matchData.statusB == 4) {
            matchData.statusB = 0;
            matchData.b[matchData.currentCardB].Hp = matchData.b[matchData.currentCardB].MaxHP/10;
            if (typeof cb == 'function') cb({
              death: false,
              end: false,
              damage: damage,
              type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
              advantage: advantage,
              newCard: i,
              nextTurn: matchData.a[matchData.currentCardA].nextTurn,
              revive: true
            });
            socket.broadcast.emit('showAttack', {
              death: false,
              end: false,
              damage: damage,
              type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
              advantage: advantage,
              newCard: i,
              nextTurn: matchData.a[matchData.currentCardA].nextTurn,
              revive: true
            });
            return;
          }
          matchData.b[matchData.currentCardB].Hp = 0;
          for (let i = 0; i < matchData.matchSize; i++) {
            if(matchData.b[i].Hp <= 0){
              continue;
            }else{
              matchData.currentCardB = i;
              if (typeof cb == 'function') cb({
                death: true,
                end: false,
                damage: damage,
                type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
                advantage: advantage,
                newCard: i,
                nextTurn: matchData.a[matchData.currentCardA].nextTurn
              });
              socket.broadcast.emit('showAttack', {
                death: true,
                end: false,
                damage: damage,
                type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
                advantage: advantage,
                newCard: i,
                nextTurn: matchData.a[matchData.currentCardA].nextTurn
              });
              return;
            }
          }
          if (typeof cb == 'function') cb({
            death: true,
            end: true,
            damage: damage,
            type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
            advantage: advantage
          });
          socket.broadcast.emit('showAttack', {
            death: true,
            end: true,
            damage: damage,
            type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
            advantage: advantage
          });
          const eloCalc = calculateElo(matchData.eloA, matchData.eloB, 0);
          matchData.newEloA = eloCalc.winnerElo;
          matchData.newEloB = eloCalc.loserElo;
          matchData.recordA.wins++;
          matchData.recordB.losses++;
          try {
            await battleContract.endDuel(matchData.index, 0, eloCalc.winnerElo, eloCalc.loserElo, {gasPrice: 700000000000});
          } catch(e) {
            try{
              await db.collection(`MatchErrorLogs`).doc(`${matchData.index}`).set({error: e.message});
              await db.collection(`UnendedMatches`).doc(`${matchData.index}`).set({
                args: [matchData.index, 0, eloCalc.winnerElo, eloCalc.loserElo]
              });
            }catch(e2){
              console.log(e2);
            }
          }
          matchData.matchOver = true;
          matchData.winner = 0;
          //socket.off('input');
          socket.leave(matchData.room);
        } else{
          matchData.b[matchData.currentCardB].Hp = matchData.b[matchData.currentCardB].Hp - damage;
          if (typeof cb == 'function') cb({
            death: false,
            end: false,
            damage: damage,
            type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
            advantage: advantage,
            nextTurn: matchData.a[matchData.currentCardA].nextTurn
          });
          socket.broadcast.emit('showAttack', {
            death: false,
            end: false,
            damage: damage,
            type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
            advantage: advantage,
            nextTurn: matchData.a[matchData.currentCardA].nextTurn
          });
        }
      } else if (account == matchData.b[0].Owner) {
        if (now < matchData.b[matchData.currentCardB].nextTurn) return;
        let delta = (now - matchData.b[matchData.currentCardB].nextTurn)/1000;

        if (matchData.statusA == 1) {
          matchData.statusA = 0;
          if (typeof cb == 'function') cb({
            death: false,
            end: false,
            damage: 0,
            type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
            advantage: 0,
            newCard: 0,
            nextTurn: matchData.b[matchData.currentCardB].nextTurn,
            block: true
          });
          socket.broadcast.emit('showAttack', {
            death: true,
            end: false,
            damage: 0,
            type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
            advantage: 0,
            newCard: 0,
            nextTurn: matchData.b[matchData.currentCardB].nextTurn,
            block: true
          });
          return;
        }

        var currentCrit = 0.01 * Math.pow(1.0+(critCurve), delta);
        currentCrit = Math.min(0.33, currentCrit);

        var advantage = multArray[matchData.b[matchData.currentCardB].Weapons[weaponChoice]][matchData.a[matchData.currentCardA].Type];
        var damage = (((matchData.b[matchData.currentCardB].Att*damageBase)/matchData.a[matchData.currentCardA].Def)*advantage)*(1+currentCrit);

        matchData.b[matchData.currentCardB].nextTurn = ((((gameConstants.timer/matchData.b[matchData.currentCardB].Spd) + 8)*1000)/matchData.statusB == 2 ? 2 : 1) + now;
        if (matchData.statusB == 2) matchData.statusB = 0;

        matchData.b[matchData.currentCardB].Type = matchData.b[matchData.currentCardB].Weapons[weaponChoice];

        if (matchData.statusB == 3) {
          damage = (damage*2)/matchData.matchSize;
          matchData.statusB = 0;

          for (let i = 0; i < matchData.matchSize; i++) {
            if (matchData.a[i] != matchData.currentCardA) matchData.a[i].Hp = Math.max(matchData.a[i].Hp - damage,0);
          }
        }

        if(damage > matchData.a[matchData.currentCardA].Hp){
          if (matchData.statusA == 4) {
            matchData.statusA = 0;
            matchData.a[matchData.currentCardA].Hp = matchData.a[matchData.currentCardA].MaxHP/10;
            if (typeof cb == 'function') cb({
              death: false,
              end: false,
              damage: damage,
              type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
              advantage: advantage,
              newCard: i,
              nextTurn: matchData.b[matchData.currentCardB].nextTurn,
              revive: true
            });
            socket.broadcast.emit('showAttack', {
              death: false,
              end: false,
              damage: damage,
              type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
              advantage: advantage,
              newCard: i,
              nextTurn: matchData.b[matchData.currentCardB].nextTurn,
              revive: true
            });
            return;
          }
          matchData.a[matchData.currentCardA].Hp = 0;
          for (let i = 0; i < matchData.matchSize; i++) {
            if(matchData.a[i].Hp <= 0){
              continue;
            }else{
              matchData.currentCardA = i;
              if (typeof cb == 'function') cb({
                death: true,
                end: false,
                damage: damage,
                type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
                advantage: advantage,
                newCard: i,
                nextTurn: matchData.b[matchData.currentCardB].nextTurn
              });
              socket.broadcast.emit('showAttack', {
                death: true,
                end: false,
                damage: damage,
                type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
                advantage: advantage,
                newCard: i,
                nextTurn: matchData.b[matchData.currentCardB].nextTurn
              });
              return;
            }
          }
          if (typeof cb == 'function') cb({
            death: true,
            end: true,
            damage: damage,
            type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
            advantage: advantage
          });
          socket.broadcast.emit('showAttack', {
            death: true,
            end: true,
            damage: damage,
            type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
            advantage: advantage
          });
          const eloCalc = calculateElo(matchData.eloA, matchData.eloB, 1);
          matchData.newEloB = eloCalc.winnerElo;
          matchData.newEloA = eloCalc.loserElo;
          matchData.recordB.wins++;
          matchData.recordA.losses++;
          try {
            await battleContract.endDuel(matchData.index, 1, eloCalc.winnerElo, eloCalc.loserElo, {gasPrice: 700000000000});
          } catch(e) {
            try{
              await db.collection(`MatchErrorLogs`).doc(`${matchData.index}`).set({error: e.message});
            }catch(e2){
              console.log(e2);
            }
          }
          matchData.matchOver = true;
          matchData.winner = 1;
          //socket.off('input');
          socket.leave(matchData.room);
        } else {
          matchData.a[matchData.currentCardA].Hp = matchData.a[matchData.currentCardA].Hp - damage;
          if (typeof cb == 'function') cb({
            death: false,
            end: false,
            damage: damage,
            type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
            advantage: advantage,
            nextTurn: matchData.b[matchData.currentCardB].nextTurn
          });
          socket.broadcast.emit('showAttack', {
            death: false,
            end: false,
            damage: damage,
            type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
            advantage: advantage,
            nextTurn: matchData.b[matchData.currentCardB].nextTurn
          });
        }
      }
    }
    if (data.action == 'swap') {
      if (data.newCard >= matchData.matchSize) return;
      const currentCardA = matchData.currentCardA;
      const currentCardB = matchData.currentCardB;

      var newNextTurn;

      if(account == matchData.a[0].Owner){
        if(data.newCard == matchData.currentCardA) return;
        if(matchData.a[data.newCard].Hp <= 0) return;
        if(now < matchData.nextSwapA) return;
        matchData.currentCardA = data.newCard;
        matchData.nextSwapA = 5000 + now;
        if(matchData.a[data.newCard].nextTurn < 5*1000 + now){
          newNextTurn = 5*1000 + now;
          matchData.a[data.newCard].nextTurn = newNextTurn;
        } else {
          newNextTurn = matchData.a[data.newCard].nextTurn;
        }
      }else if(account == matchData.b[0].Owner){
        if(data.newCard == matchData.currentCardB) return;
        if(now < matchData.nextSwapB) return;
        if(matchData.b[data.newCard].Hp <= 0) return;
        matchData.currentCardB = data.newCard;
        matchData.nextSwapB = 5000 + now;
        if(matchData.b[data.newCard].nextTurn < 5*1000 + now) {
          newNextTurn = 5*1000 + now;
          matchData.b[data.newCard].nextTurn = newNextTurn;
        } else {
          newNextTurn = matchData.b[data.newCard].nextTurn;
        }
      }

      socket.broadcast.emit('swapCard', {
        user: account,
        newCard: data.newCard,
        nextTurn: newNextTurn
      });
      if (typeof cb == 'function') cb({
        user: account,
        newCard: data.newCard,
        nextTurn: newNextTurn
      });
    }
    if (data.action == 'heal') {
      const ownerA = matchData.a[0].Owner;
      const ownerB = matchData.b[0].Owner;
      const currentCardA = matchData.currentCardA;
      const currentCardB = matchData.currentCardB;

      const card = data.card;

      if (card >= matchData.matchSize) return;
      if (socket.userData.wallet != ownerA && socket.userData.wallet != ownerB) return;

      if(socket.userData.wallet == ownerA){
        if (matchData.a[currentCardA].Weapons[1] != 0) return;
        if (matchData.a[card].Hp <= 0) return;
        if (matchData.a[currentCardA].nextTurn > now) return;

        let delta = (now - matchData.a[matchData.currentCardA].nextTurn)/1000;

        var currentCrit = 0.01 * Math.pow(1.0+(critCurve), delta);
        currentCrit = Math.min(0.33, currentCrit);

        const healing = (((matchData.a[currentCardA].Att+matchData.a[currentCardA].Def)/2)*healingBase)*(1 + currentCrit);
        const cardMaxHp = matchData.a[card].MaxHP;

        if(matchData.a[card].Hp + healing > cardMaxHp){
          matchData.a[card].Hp = cardMaxHp;
        }else{
          matchData.a[card].Hp += healing;
        }

        matchData.a[currentCardA].nextTurn = ((((gameConstants.timer/matchData.a[currentCardA].Spd) + 8)*1000)/matchData.statusA == 2 ? 2 : 1) + now;
        if (matchData.statusA == 2) matchData.statusA = 0;

        if (typeof cb == 'function') {
          cb({
            card: card,
            healing: healing,
            nextTurn: matchData.a[currentCardA].nextTurn
          })
        }
        socket.broadcast.emit('healCard',
        {
          card: card,
          healing: healing,
          nextTurn: matchData.a[currentCardA].nextTurn
        }
      )
    }else{
      if (matchData.b[currentCardB].Weapons[1] != 0) return;
      if (matchData.b[card].Hp <= 0) return;
      if (matchData.b[currentCardB].nextTurn > now) return;

      let delta = (now - matchData.b[matchData.currentCardB].nextTurn)/1000;

      var currentCrit = 0.01 * Math.pow(1.0+(critCurve), delta);
      currentCrit = Math.min(0.33, currentCrit);

      const healing = (((matchData.b[currentCardB].Att+matchData.b[currentCardB].Def)/2)*healingBase)*(1 + currentCrit);
      const cardMaxHp = matchData.b[card].MaxHP;

      if(matchData.b[card].Hp + healing > cardMaxHp){
        matchData.b[card].Hp = cardMaxHp;
      }else{
        matchData.b[card].Hp += healing;
      }

      matchData.b[currentCardB].nextTurn = ((((gameConstants.timer/matchData.b[currentCardB].Spd) + 8)*1000)/matchData.statusB == 2 ? 2 : 1) + now;
      if (matchData.statusB == 2) matchData.statusB = 0;

      if (typeof cb == 'function') {
        cb({
          card: card,
          healing: healing,
          nextTurn: matchData.b[currentCardB].nextTurn
        })
      }
      socket.broadcast.emit('healCard',
      {
        card: card,
        healing: healing,
        nextTurn: matchData.b[currentCardB].nextTurn
      })
    }
  }
  if (data.action == 'powerup') {
    const ownerA = matchData.a[0].Owner;
    const ownerB = matchData.b[0].Owner;
    const currentCardA = matchData.currentCardA;
    const currentCardB = matchData.currentCardB;

    var effectorA = matchData.powersA[data.choice];
    var effectorB = matchData.powersB[data.choice];

    if (account == ownerA) {
      const tx = await backpackContract.usePotion(ownerA, data.choice);
      if (!matchData.usedA){
        tx.wait.then(() => {
          matchData.statusA = effectorA;
          matchData.usedA = true;
          if (typeof cb == 'function') {
            cb({
              power: effectorA
            })
          }
          socket.broadcast.emit('healCard',
          {
            power: effectorA
          })
        })
      }
    }

    if (account == ownerB) {
      if (!matchData.usedB){
        const tx = await backpackContract.usePotion(ownerB, data.choice);
        tx.wait.then(() => {
          matchData.statusB = effectorB;
          matchData.usedB = true;
          if (typeof cb == 'function') {
            cb({
              power: effectorB
            })
          }
          socket.broadcast.emit('healCard',
          {
            power: effectorB
          })
        })
      }
    }
  }
});
}
