import * as gameConstants from 'logic/params.js';

const DamageMultArray0 = [2,1,1,1];
const DamageMultArray1 = [4,2,1,4];
const DamageMultArray2 = [4,4,2,1];
const DamageMultArray3 = [4,1,4,2];
export const multArray = [DamageMultArray0,DamageMultArray1,DamageMultArray2,DamageMultArray3];

const damageBase = 1250;
const healingBase = 10;
const critCurve = 0.8;
const crit = 0.33;

export const battleActions(matchData, socket, io) {
  const account = socket.userData.wallet;
  socket.on('action', (data, cb) => {
    const now = Date.now();
    if (data.action == 'attack') {
      const choice = data.weaponChoice;
      if (account == matchData.a[0].Owner) {
        let delta = (now - matchData.a[matchData.currentCardA].NextTurn)/1000;

        var currentCrit = 0.01 * Math.pow(1.0+(critCurve), delta);
        currentCrit = Math.min(0.33, currentCrit);

        var advantage = multArray[matchData.a[matchData.currentCardA].Weapons[weaponChoice]][matchData.b[matchData.currentCardB].Type];
        var damage = ((((matchData.a[matchData.currentCardA].Att*damageBase)/matchData.b[matchData.currentCardB].Def)*advantage)*(1+currentCrit);

        socket.broadcast.emit('showAttack', {
          user: socket.userData.wallet,
          damage: damage,
          type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
          advantage: advantage
        });

        matchData.a[matchData.currentCardA].NextTurn = (gameConstants.timer/matchData.a[matchData.currentCardA].Spd) + 8 + now;
        matchData.a[matchData.currentCardA].Type = matchData.a[matchData.currentCardA].Weapons[weaponChoice];

        if(damage > matchData.b[matchData.currentCardB].Hp){
            matchData.b[matchData.currentCardB].Hp = 0;
            for (uint i = 0; i < matchData.matchSize; i++) {
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
                      newCard: i
                    });
                    return;
                }
            }

            matchData.matchOver = true;
            if (typeof cb == 'function') cb({
              death: true,
              end: true,
              damage: damage,
              type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
              advantage: advantage
            });
        } else{
            matchData.b[matchData.currentCardB].Hp = matchData.b[matchData.currentCardB].Hp - damage;
            if (typeof cb == 'function') cb({
              death: false,
              end: false,
              damage: damage,
              type: matchData.a[matchData.currentCardA].Weapons[weaponChoice],
              advantage: advantage,
              newCard: i
            });
        }
      } else if (account == battleData.b[0].Owner) {
        let delta = (now - matchData.b[matchData.currentCardB].NextTurn)/1000;

        var currentCrit = 0.01 * Math.pow(1.0+(critCurve), delta);
        currentCrit = Math.min(0.33, currentCrit);

        var advantage = multArray[matchData.b[matchData.currentCardB].Weapons[weaponChoice]][matchData.a[matchData.currentCardA].Type];
        var damage = ((((matchData.b[matchData.currentCardB].Att*damageBase)/matchData.a[matchData.currentCardA].Def)*advantage)*(1+currentCrit);

        socket.broadcast.emit('showAttack', {
          user: socket.userData.wallet,
          damage: damage,
          type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
          advantage: advantage
        });

        matchData.b[matchData.currentCardB].NextTurn = (gameConstants.timer/matchData.b[matchData.currentCardB].Spd) + 8 + now;
        matchData.b[matchData.currentCardB].Type = matchData.b[matchData.currentCardB].Weapons[weaponChoice];

        if(damage > matchData.a[matchData.currentCardA].Hp){
            matchData.a[matchData.currentCardA].Hp = 0;
            for (uint i = 0; i < matchData.matchSize; i++) {
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
                      newCard: i
                    });
                    return;
                }
            }
            matchData.matchOver = true;
            if (typeof cb == 'function') cb({
              death: true,
              end: true,
              damage: damage,
              type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
              advantage: advantage
            });
        } else{
            matchData.a[matchData.currentCardA].Hp = matchData.a[matchData.currentCardA].Hp - damage;
            if (typeof cb == 'function') cb({
              death: false,
              end: false,
              damage: damage,
              type: matchData.b[matchData.currentCardB].Weapons[weaponChoice],
              advantage: advantage,
              newCard: i
            });
        }
      }
    }
    if (data.action == 'swap') {
      if (data.newCard >= matchData.matchSize) return;
      if(account == matchData.a[0].Owner){
          if(data.newCard == matchData.currentCardA) return;
          if(matchData.a[newCard].Hp <= 0) return;
          matchData.currentCardA = data.newCard;
          if(matchData.a[currentCardA].NextTurn < 8 + now){
              matchData.a[currentCardA].NextTurn = 8 + now;
          }
      }else if(account == matchData.b[0].Owner){
        if(data.newCard == matchData.currentCardA) return;
        if(matchData.b[newCard].Hp <= 0) return;
          matchData.currentCardB = data.newCard;
          if(matchData.b[currentCardB].NextTurn < 8 + now) {
              matchData.b[currentCardB].NextTurn = 8 + now;
          }
      }
      socket.broadcast.emit('swapCard', {
        user: account,
        newCard: newCard,
        nextTurn: 8 + now
      });
      if (typeof cb == 'function') cb({
        user: account,
        newCard: newCard,
        nextTurn: 8 + now
      });
    }
  });
}
