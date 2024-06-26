//надо выделить функции finishGame для завершения игры и ведения статистики и startGame, для вычита баланса при старте игры и, возможно, если такое есть в сервисе, вести лог в бд
const { User } = require('../models/db-models');
const BackgammonsBETS = require('../../json/bets.json').BackgammonsBETS;
async function balanceTravers(winner, loser, betId) {
    const bet = BackgammonsBETS[betId];
    const comission = bet.comission*2; // comission from 2 players
    const lose = bet.bet;
    const prize = bet.bet*(1-comission); // prize with comission

    // get money from loser user
    await balanceTransaction(loser.userId, -lose);
    // send money to winner user
    await balanceTransaction(winner.userId, prize);
}
async function balanceTransaction(userId, balanceDifferncial) {
  try {
    const _user = await getUser(userId);
    const newbalance = _user.balance + balanceDifferncial;
    await _user.update({
        balance: newbalance,
    });
    sendUpdateBalance(userId, newbalance)
  } catch (e) {
    logInvalidTransaction(userId, balanceDifferncial, e);
  }
}
/**
 * @param {int} userId
 * @returns {import('../models/db-models').UserModel}
 */
async function getUser(userId) {
  return await User.findOne({ where: { id: userId }, });
}
/** @returns {FLOAT} */
async function getUserBalance(userId) {
  return (await getUser(userId)).balance;
}
async function sendUpdateBalance(userId, balance) {
  // console.log(getaWSS, )
  const aWSS = require('./../backgamons.js').getaWSS();
  for(const client of aWSS.clients) {
    console.log(client.ctx?.user, userId, client.ctx?.user?.userId === userId);
    if(client.ctx?.user?.userId === userId)
      client.ctx.send({method:'updateBalance', balance})
  }
}
function logInvalidTransaction(userId, balanceDifferncial, e) {
  console.log('INVALID TRANSACTION user --', userId, ' shoul add to balance ', balanceDifferncial, ' exception', e);
}
module.exports = {
  balanceTravers, getUser, getUserBalance
};