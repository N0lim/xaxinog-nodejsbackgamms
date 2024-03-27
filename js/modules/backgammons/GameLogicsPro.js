import { $myeval, EventProvider } from "./Utilities.js";
import { BoardConstants, refToArr, slotinfo, Slot, DropSlot } from './BoardConstants.js';
import { BoardCanvas } from './CanvasRender.js'


const SlotsIterator = (slots, CB)=>(
                                slots = new Proxy(slots, {get:(slots,key)=>slots[key]||[0,0]}), 
                                [...Array(24).keys()].map(index=>CB(slots[index]))
                            );
const { WHITE, BLACK, EMPTY, CHECKERS, MAP } = BoardConstants;
// for jsDoc
class TCRColour {
    /** @type {int} */
    id
    /** @type {string} */
    name
    /** @type {string} */
    over
}
class Board {
    FartherOpponentCheckerPos
    Slots
    Drops
    TEMP = {
        MovesCash: {},
        MovesStack: []
    }
    constructor(BoardInits) {
        const self = this;
        const {User} = BoardInits;
        this.User = User;//need field @team -> BoardConstant[WHITE||BLACK];
        this.Slots = SlotsIterator(BoardInits.Slots, data=>data);
        this.eventProviders = {
            showPTS: new EventProvider()
        }

        this.Drops = [
            new DropSlot(EMPTY.id), new DropSlot(WHITE.over), new DropSlot(BLACK.over)
        ];
        let emptyslot
        this.Slots0 = new Proxy({}, {
            /**
             * 
             * @param {*} _t 
             * @param {*} SlotIndex 
             * @param {*} _proxy 
             * @returns {Slot}
             */
            get:(_t, SlotIndex, _proxy) => {
                // if(slotIndex === 'iterate') return (from, to, CB, team) => {
                //     for()
                // }
                if(SlotIndex === 'User') return User;
                if(SlotIndex === 'emptyslot') return emptyslot;
                if(SlotIndex === WHITE.over) return this.Drops[WHITE.id];
                if(SlotIndex === BLACK.over) return this.Drops[BLACK.id];
                return new Slot(self.Slots[SlotIndex], SlotIndex, _proxy)
            }
        });
        // 0 -> MAP.firstSlotIndex // TODO: change 0 index to unaviable index =D
        emptyslot = new Slot(new slotinfo(CHECKERS.empty, EMPTY.id), 0, this.Slots0);
    }
    /**
     * 
     * @param {GameState} GameState 
     * @param {int} fromIndex 
     * @returns {{}}
     */
    UserMovesFrom(GameState, fromIndex) {
        const Sloter = this.Slots0;
        const {User} = this;
        const {PTS, ActivePlayer, CurrentStepCash, Dices} = GameState;
        const FromSlot = this.Slots0[fromIndex];
        const headSlotIndex = ActivePlayer.team.id===WHITE.id?0:12;
        const headSlotCheckersCount = this.Slots0[headSlotIndex].refToArr.Count;
        const [f, s] = Dices;
        const fstepapplied = (f===s&&(f===3||f===4||f==6))&&(headSlotCheckersCount===14);
        const isCanToOver = _isCanToOver();
        const CashOfOiFBySlot = {}

        if(ActivePlayer.team.id !== User.team.id) return {};
        if(!FromSlot.ismy()) return {};
        const TeamFirstSlot = ActivePlayer.team.id===WHITE.id?0:12;
        if(!fstepapplied) 
            if(fromIndex===TeamFirstSlot&&GameState.headed) return {};

        const AccMoves = {
            fromIndex,
            moves:{},
            /**
             * 
             * @param {int} toIndex 
             * @param {int[]} Points array of used points
             * @returns {int} -1 if PermanentSetReturnCode
             */
            push(toIndex, Points) {
                const PermanentSetReturnCode = -1
                const {moves} = this;
                if(toIndex !== User.team.over) return (moves[toIndex] = Points, PermanentSetReturnCode);
                else if(moves[toIndex] === undefined) 
                    moves[toIndex] = [];//if isover we should ask user to choose which point he spend to step
                return moves[toIndex].push(Points);
            },
            optimize() {
                // Object.entries(this.moves).map(([toIndex,listOfPointsList])=>{
                //     listOfPointsList.reduce((acc, cur)=>{
                //         if(acc.length < cur.length) return acc;
                //         if(acc.reduce((s,p)=>s+p) < cur.reduce((s,p)=>s+p)) return acc;
                //     });
                // });
                Object.entries(this.moves).map(([toIndex, ListOfPointsList])=>{
                    if(ListOfPointsList.length === 1) return;
                    if(ListOfPointsList[0].length === ListOfPointsList[1].length) return;
                    return this.moves[toIndex] = [
                        ListOfPointsList[0].length < ListOfPointsList[1].length
                                                ? ListOfPointsList[0] 
                                                : ListOfPointsList[1]
                                        ];
                })
                return this.moves;
            }
        };
        /**
         * 
         * @param {int[]} PTS 
         * @param {Slot} FromSlot 
         * @param {int[]} spendedPoints 
         */
        function StepByStep(PTS, FromSlot, SlotCursor=FromSlot, spendedPoints=[]) {
            for(const point of new Set(PTS)) {
                const curSlot = SlotCursor.next(point);
                if(curSlot?.isover) {
                    isCanToOver&&AccMoves.push(curSlot.index, [...spendedPoints, point]); 
                    continue;
                };
                if(curSlot.ismy()||curSlot.isempty()) {
                    const curSpended = [...spendedPoints, point];
                    if((!OpponentIsFarther(curSlot.index))&&sixchecker(curSlot, FromSlot)) continue;
                    AccMoves.push(curSlot.index, curSpended);

                    const nextPTS = [...PTS]; nextPTS.splice(PTS.indexOf(point), 1);
                    if(!nextPTS.length) continue;

                    StepByStep(nextPTS, FromSlot, curSlot, curSpended);
                }
            }
        }
        StepByStep(PTS, FromSlot);

        function _isCanToOver() {
            const isBlack = ActivePlayer.team.id === BLACK.id;
            const from = isBlack?MAP.blackstart:MAP.whitestart;
            const to = isBlack?MAP.blackLastIndexNumber:MAP.whiteLastIndexNumber-6;

            let outerhouse = false;
            // for beauty should use Slot.next(1) from Sloter[0] to Sloter[17] 
            // but we can think this is optimized variant
            if(isBlack) {
                for(let index = from; index < 23 && !outerhouse; ++index) 
                    outerhouse |= Sloter[index].ismy();
                for(let index = 0; index < 6 && !outerhouse; ++index) 
                    outerhouse |= Sloter[index].ismy();
            } else for(let index = from; index <= to && !outerhouse; ++index) 
                    outerhouse |= Sloter[index].ismy();
            
            
            return !outerhouse;
        }

        /**
         * @TODO upd algol with excluding of slot if u stepFrom
         * @param {Slot} toSlot 
         * @param {Slot} fromSlot 
         * @returns {boolean} if 6 sequenced checkers
         */
        function sixchecker(toSlot, fromSlot) {//проверять передние клетки
            //TODO: upd algol with excluding of slot if u stepFrom
            // const sum = (acc, bool)=>acc+(+bool);
            /** @type {int} */
            const CurrentPlayerTeam = ActivePlayer.team.id;
            /** @type {int} */
            const OpponentPlayerTeam = CurrentPlayerTeam===WHITE?BLACK:WHITE;
            let counter = 1;
            let curSlot = toSlot;
            for(const _ of Array(5).keys()) {
                curSlot = curSlot.down(OpponentPlayerTeam);
                if(curSlot.index == fromSlot.index && !(curSlot.refToArr.Count-1)) break;
                if(curSlot.ismy()) counter++
                else break;
            }
            curSlot = toSlot;
            for(const _ of Array(5).keys()) {
                curSlot = curSlot.next(+1, OpponentPlayerTeam);
                if(curSlot.index == fromSlot.index && !(curSlot.refToArr.Count-1)) break;
                if(curSlot.ismy()) counter++
                else break;
            }
            return counter>=6;
        }

        /**
         * @param {int} slotIndex 
         * @returns {boolean}
         */
        function OpponentIsFarther(slotIndex) {
            if(CashOfOiFBySlot[slotIndex]) return CashOfOiFBySlot[CashOfOiFBySlot];
            /** @type {int} */
            const CurrentPlayerTeam = ActivePlayer.team.id;
            /** @type {int} */
            const OpponentPlayerTeam = CurrentPlayerTeam===WHITE.id?BLACK.id:WHITE.id;

            /** @type {boolean} */
            const isBlack = OpponentPlayerTeam === BoardConstants.BLACK.id;

            const blackEndShift = 12
            const blackStartShift = -12
            /**
             * @param {int} from 
             * @param {int} point 
             */
            function up(from, point) {//TODO: унифицировать функцию в BoardConstants
                const pos = +from + +(isBlack&&((from<BoardConstants.MAP.blackend)?blackEndShift:blackStartShift)) + point;
                
                //validating
                const isover = pos > BoardConstants.MAP.lastPostionNumber;

                const index = isover?'*over':isBlack?(pos+12)%24:pos;
                
                return {pos, isover, index};
            }
            let _index_ = slotIndex;
            while(_index_ < 36) {
                const {pos, isover, index} = up(_index_, +1);
                if(isover) return false;
                /** @type {Slot} */
                const pp = Sloter[index];
                if(pp.refToArr.Colour === OpponentPlayerTeam) return true;
                _index_ = index;
            }
            return false;
        }
        CurrentStepCash.MovesCash = AccMoves
        return AccMoves.optimize();
    }
    CheckersWhichCanMove(GameState) {
        return !![...Array(24).keys()]
                    .map(i=>Object.keys(this.UserMovesFrom(GameState, i)).length)
                    .reduce((acc,k)=>acc+k);
    }
    UserMovesByDice(GameState, Dice) {

    }
    /**
     * 
     * @param {GameState} GameState 
     * @param {{from:int, to:int}} param1 
     * @param {int} variantIndex 
     */
    UserMove(GameState, {from, to}, variantIndex) {
        const {CurrentStepCash} = GameState;
        const MovesCash = CurrentStepCash.MovesCash.fromIndex === from
                                                ? CurrentStepCash.MovesCash.moves
                                                : this.UserMovesFrom(GameState, from);
        if(to === WHITE.over || to === BLACK.over){
            const sum = (acc, num)=>acc+num;
            const points = MovesCash[to].length===1
                                ? MovesCash[to][0]
                                : variantIndex
                                    ? map[to][variantIndex]
                                    : [[1000],...MovesCash[to]].reduce(
                                        /**
                                         * 
                                         * @param {int} acc 
                                         * @param {int[]} points
                                         * @returns {int}
                                         */
                                        function(acc, points) {
                                            return acc.reduce(sum) < points.reduce(sum) ? acc : points
                                        });
            CurrentStepCash.MovesStack.push({from, to, points});
        } else CurrentStepCash.MovesStack.push({from, to, points:MovesCash[to]});
        this.Slots0[from].permMoveTo(to);
        this.eventProviders.showPTS.send(GameState.PTS);
        return true;
    }
    UserStepComplete() {

        this.Temp = [];
    }
    CancelLastMove() {

    }
    /**
     * 
     * @param {GameState} GameState 
     * @param {{from:int, to:int|string}[]} step 
     */
    PermStep(GameState, step) {
        step.map(({from, to})=>{
            const FromSlot = this.Slots0[from]
            const ToSlot = this.Slots0[to]
            if(ToSlot.refToArr.Count++===0)
                ToSlot.refToArr.Colour = GameState.ActivePlayer.team.id;
            if(--FromSlot.refToArr.Count===0)
                FromSlot.refToArr.Colour = 0;
        })
    }
}

class GameState {
    /**
     * @type {{userId:int, username:string, team:TCRColour}}
     */
    ActivePlayer
    /** @type {[Number, Number]} */
    Dices
    /**
     * @type {{userId:int, username:string, team:TCRColour}[]}
     */
    players

    CurrentStepCash = {
        MovesStack: [],
        MovesCash: {}
    }

    GameState = BoardConstants.GAMESTATE.Waiting;
    get PTS() {
        const [f, s] = this.Dices;
        const sum = (acc, num) => acc + num;
        const clearPTS = f===s?[f, f, s, s]:[f, s];
        const usedPTS = this.CurrentStepCash.MovesStack.map(({points})=>points).flat(10);
        let renewalPTS = clearPTS; let used = false;
        usedPTS.map(point=>{//TODO: переписат до лаконичного использования редьюс
            used = false;
            renewalPTS = renewalPTS.filter(cp=>{
                if(cp===point && !used) {
                    used = true
                    return false
                }
                return true;
            });
        })
        return renewalPTS;
    }
    /**
     * @returns {boolean}
     */
    get headed() {
        const headSlotIndex = this.ActivePlayer.team.id===WHITE.id?0:12;
        for(const {from} of this.CurrentStepCash.MovesStack)
            if(from===headSlotIndex) return true;
        return false;
    }
    constructor(GameStateInits) {}

    start(state, players, canvas){
        this.GameState = BoardConstants.GAMESTATE.GameStarted;
        this.players = [{},...players].reduce((acc, player)=>
            (acc[player.team] = (player.team = [WHITE, BLACK][player.team-1], player), acc)
        );
        console.log(this.players);
        this.state(state, canvas);
    }
    /**
     * 
     * @param {{ActiveTeam:int, Dices:[Number, Number]}} param0
     */
    state({ActiveTeam, Dices}, canvas) {
        this.CurrentStepCash = {
            MovesStack: [],
            MovesCash: {}
        }
        this.ActivePlayer = this.players[ActiveTeam];
        this.Dices = Dices;
        canvas.createDices(Dices[0], Dices[1], [BoardConstants.WHITE, BoardConstants.BLACK][ActiveTeam-1].id);
    }
    finish(WinnerTeam) {

    }
}

export class GameProvider {
    /**
     * 
     * @param {{User:{userId,username}, Slots:int[], sendstep:Function, Drops:[Number, Number]}} BoardInits 
     * @param {*} GameStateInits 
     */
    constructor(BoardInits, GameStateInits) {
        const self = this;
        this.Board = new Board(BoardInits);
        this.GameState = new GameState(GameStateInits);
        this.GameCanvas = new BoardCanvas(
            BoardInits.Slots, BoardInits.Drops, {
            UserMovesFrom:(...args)=>this.Board.UserMovesFrom(this.GameState, ...args),
            move: (from, to)=>{
                const ret = this.Board.UserMove(this.GameState, {from:+from, to:$myeval(to)})
                if(this.GameState.PTS?.length===0 || !this.Board.CheckersWhichCanMove(this.GameState))
                    BoardInits.sendstep(this.GameState.CurrentStepCash.MovesStack);
                return ret;
            }
        });
        
        this.Board.eventProviders.showPTS(pts=>this.GameCanvas.setPTS(pts));

        /** @type {{start:Function, step:Function, ustep:Function, end:Function}} */
        this.eventHandlers = {
            start(GameStateData, players) {
                self.GameState.start(GameStateData, players, self.GameCanvas);
            },
            /**
             * @param {{from, to}[]} Step 
             * @param {{ActiveTeam, Dice}} newGameStateData 
             */
            step(Step, newGameStateData) {
                self.Board.PermStep(self.GameState, Step);
                Step.map(({from, to})=>self.GameCanvas.moveChecker(from, to));
                self.GameState.state(newGameStateData, self.GameCanvas);
            },
            ustep(Step, newGameStateData) {
                self.GameState.state(newGameStateData, self.GameCanvas);
            },
            end() {

            }
        };
        this.eventProviders = [ 'UserStep' ];
        this.InstantActions = {
            UserStep() {

            }
        }
    }
}