const { serializable } = require("./serializablewtf.js");
const { getRandomInt, FCPromise } = require("./Utility");
const { CONSTANTS, Debug, TUser, TPlayer, TState, ConnectionContext, EventProvider, nextTeamDict, makeEvent } = require("./Generals");
const { WHITEID, BLACKID } = CONSTANTS;

const timestamp = ()=>Date.now();
module.exports.timestamp = timestamp;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const range = (from, len) => [...Array(len).keys()].map(x => x + from);//make iterator with Array methods?
const adv0_range = (from, len, vals) => range(from,len).map((i)=>vals[i]||vals?.null());
const randdice = ()=>[getRandomInt(1,6), getRandomInt(1,6)];
/** @type {Number} in seconds*/
const USERTIME = 60;
/** @type {Number} in seconds*/
const STEPTIME = 25;
/** @type {Number} in millesecons*/
const SecondInMilliseconds = 1000;

class timersnapshot {
    success = false
    pending = false
    timestamp = timestamp()
    /** @type {Function || undefined} */
    waiting
    /** @returns {Number} spended userTime in seconds*/
    actual() {
        const diff = Math.floor((timestamp() - this.timestamp)/SecondInMilliseconds) - STEPTIME;
        return diff>0?diff:0;
    }
    /** @returns {Number} spended userTime in milliseconds*/
    actualms() {
        const diff = timestamp() - this.timestamp - STEPTIME*SecondInMilliseconds;
        return diff>0?diff:0;
    }
}
/**
 * start to start
 * pause to pause
 * resume to resume or complete timer if not success
 * success to decline completing on resume
 * 
 */
const Timer = class {
    /** @type {int} in seconds*/
    userTime = USERTIME
    /** @type {timersnapshot || null} null if deactive*/
    snap
    onfinish = new EventProvider();
    finished = false;

    constructor(Team) { this.Team = Team; }
    start() {
        const Timer = this;
        const snap = this.snap = new timersnapshot();
        setTimeout(ontimeout, STEPTIME*SecondInMilliseconds);
        function ontimeout() {
            if(snap.success || Timer.__off) return;
            if(snap.pending) snap.waiting = startUserTimer;
            return startUserTimer();
        }
        function startUserTimer() {
            const finish = ()=>(!Timer.finished)&&(Timer.finished=true, Timer.onfinish.send(Timer.Team, Timer, snap))
            if(Timer.finished || Timer.__off) return;
            if(Timer.userTime <= 0 || ((Timer.userTime*SecondInMilliseconds - snap.actualms()) <= 0))
                return finish();
            setTimeout(()=>{
                if(snap.success) return;
                if(snap.pending) return snap.waiting = startUserTimer;
                if(!(snap.actual() >= Timer.userTime))
                    console.log('timer in backgammons/GameRoom.js completed byt userTime bigger than skipped time..',
                                '   || but we finished game(maybe)', ` diff=${snap.actual()}s`, ` userTime = ${Timer.userTime}s`)
                finish();
            }, Timer.userTime*SecondInMilliseconds - snap.actualms())
        }
    }
    off(){
        this.__off = true;
    }
    pause() {
        if(this.snap)
            this.snap.pending = true;
    }
    resume() {
        if(this.snap?.success||!this.snap) return;
        this.snap.pending = false;
        this.snap.waiting?.();
        // if(!this.snap.waiting) console.log('timer in backgammons/GameRoom.js resumed, but not found \'waiting\' callback!')
    }
    success() {
        // console.log('success', this);
        if(!this.snap) return
        this.snap.success = true;
        const userTimerMinus = this.snap.actual();
        this.snap = null;
        this.userTime -= userTimerMinus;
        return userTimerMinus;
    }
    reject() {
        if(this.snap) console.log('in step end timer snap not null??!!')
    }
    /** @returns {[Number, Number]} */
    json() {
        const diff = this.snap?.actual?.();
        // console.log('json()', this, diff)
        return [this.userTime, this.snap?this.snap.timestamp:0 ];
    }
}
class Timers extends serializable {
    /** @type {Number} */
    activetimer = 0;
    /** @type {[Timer, Timer]} */
    timers = [new Timer(CONSTANTS.WHITEID), new Timer(CONSTANTS.BLACKID)]
    onfinish = new EventProvider();
    get curTimer() {
        this.timers.map(({onfinish})=>onfinish((...args)=>this.onfinish.send(...args)))
        return this.timers[this.activetimer];
    }
    set curTimer(ActiveTeam) {
        const timesIndex = {
            [CONSTANTS.WHITEID]: 0,
            [CONSTANTS.BLACKID]: 1
        }
        this.curTimer.reject();
        this.activetimer = timesIndex[ActiveTeam];
        this.curTimer.start();
        // this.curTimer = new Timer(60*1000, ()=>
        //         this.endGame(ActiveTeam/* in context this is OpponentTeam */, 'Time end', 'timer'));
    }
    // get success() {return this.curTimer.success.bind(this.curTimer)}

    off() { this.timers.map(timer=>timer.off()); }
    json() { return this.timers.map(timer=>timer.json()); }
}

class SharedRoom0 extends serializable { // deprec // TODO: extends from WSListeners
    Connections = {};

    constructor(GameID=[-1,-1]) {
        super();
        this.GameID = GameID; 
    }
    /**
     * 
     * @param {TUser} user 
     * @param {ConnectionContext} ctx 
     * @param {WebSocket} ws 
     */
    connect(user, ctx, ws) {
        const rikey = ctx.rikey = `${user.clientId}-${user.userId}-${getRandomInt(-10,100)}`;
        this.event('backgammons::connection', user, 'add ignoreList and send current user..');//? player:visitor
        this.Connections[rikey] = ({user, ctx, ws, send:(...args)=>ctx.send(...args)});
        console.log(rikey, user);
    }
    disconnect(user, ctx, ws) {
        if(ctx.rikey)
            delete this.Connections[ctx.rikey];
    }
    event(event, obj) {
        const msg = Object.assign(obj, {event, method:'backgammons::event'});
        // console.log(`sending`, msg, Object.values(this.Connections))
        Object.values(this.Connections).map(async(ctx)=>ctx.send(msg));
    }
    chat(msg) {
        this.event('message', {text:msg.text})
    }
}
class TGame extends SharedRoom0 {
    // /** @type {TPlayer.PlayersContainer} */
    // Players = new TPlayer.PlayersContainer(this)
    RoomState = new WaitingState(this);
    events = new class {
        //Lobby
        onconnect = new EventProvider()
        onexit = new EventProvider()
        //inGame
        onstart = new EventProvider()
        onfinish = new EventProvider()
    }
    /**
     * 
     * @param {[Number, Number]} GameID 
     * @param {'test' || 'flud' || undefined} test 
     */
    constructor(GameID, test) {
        super(GameID);
        // const nextTeamDict = {
        //     [CONSTANTS.WHITEID]: CONSTANTS.BLACKID,
        //     [CONSTANTS.BLACKID]: CONSTANTS.WHITEID
        // }
        // if(test==='test')
        //     this.Slots = adv0_range(0, 24, { 18:[15,1], 6:[15,2], null:()=>[0,0] });
        // if(test==='flud')
        //     this.Slots = adv0_range(0, 24, { 0:[9,1], 12:[14,2], 11:[1,2], 18:[1,1],13:[1,1],14:[1,1],15:[1,1],16:[1,1],17:[1,1],null:()=>[0,0] });
        // this.Timers.onfinish(Team=>this.endGame(nextTeamDict[Team], 'time end', 'timer'))
    }
    /**
     * 
     * @param {int} userId 
     * @param {boolean} value 
     */
    setAutostep(userId, value) {
        const player = this.RoomState?.getPlayerByID?.(userId);
        if(!player) return {result:'nope'};
        player.autodice = value;
        this.event('autodiceset', {userId, value})
    }
    connect(ctx, ws) {
        super.connect(ctx.user, ctx, ws);
        const res = this.RoomState.connect?.(ctx);
        ctx.event('backgammons::connection::self', this[serializable.prioritetSerial]());
        return res;
    }
    /** @type {ctxHandlerT<void|true>} */
    disconnect(ctx) {
        super.disconnect(ctx.user, ctx, ctx.ws);
        if(this.RoomState.disconnect?.(ctx)) return (this.event('backgammons::room::disconnect', ctx.user.userId), true);
    }
    /** @param {TeXRoomState} newState */
    upgradeState(newState) {
        this.RoomState = newState;
        this.event('RoomStateChanged', {newStateId: newState.RoomState, stateData:newState.json()});
    }
    // startGame() {
    //     this.Players.rollTeam()
    //     this.info = {
    //         ActiveTeam: CONSTANTS.WHITEID,
    //         Dices: randdice()
    //     }
    //     this.event('backgammons::GameStarted', {slots: this.Slots, state: this.info, players:this.Players.json()});
    //     this.RoomState = CONSTANTS.RoomStates.Started;
    //     this.events.onstart.send()
    // }
    rollDice() {
        return this.RoomState.rollDice(...arguments);
    }
    stepIfValid(user, step, code) {
        return this.RoomState.stepIfValid?.(...arguments);
    }
    json() {
        return Object.assign(this.RoomState.json(), {GameID:this.GameID, RoomState:this.RoomState.RoomState})
    }
    minjson() {
        return [this.RoomState.players, this.RoomState.RoomState]
    }
    // nextState() {
    //     const nextTeam = nextTeamDict[this.info.ActiveTeam];
    //     this.Timers.curTimer = nextTeam;
    //     return this.info = {
    //         ActiveTeam: nextTeam,
    //         Dices: randdice()
    //     }
    // }
    // slot(index) {
    //     if(index === 'blackover' || index === 'whiteover') {
    //         const Drop = this.Drops;
    //         return {
    //             add(ColourID) {
    //                 Drop[index] = 1 + (Drop[index]?Drop[index]:0);
    //             },
    //             take() {console.log('error: tried to access to Drop.take()')}
    //         }
    //     }
    //     const Slot = this.Slots[index];
    //     const refToArr = new (class {
    //         ref
    //         constructor(ref) { this.ref = ref; }
    //         get Colour() {
    //             return this.ref[1]
    //         }
    //         set Colour(value) {
    //             return this.ref[1] = value;
    //         }
    //         get Count() {
    //             return this.ref[0]
    //         }
    //         set Count(value) {
    //             return this.ref[0] = value;
    //         }
    //     })(Slot)
    //     return {
    //         add(ColourID) {
    //             if(refToArr.Count++===0)
    //                 refToArr.Colour = ColourID;
    //         },
    //         take(ColourID) {
    //             refToArr.Colour = (--refToArr.Count===0)?0:ColourID;
    //         }
    //     }
    // }
}
module.exports.TGame = TGame;
class TeXRoomState extends serializable { 
    /** @type {TGame}*/ 
    Room; 
    /** @param {TGame | TeXRoomState} input */
    constructor(input) {
        super();
        console.log('TeXRoomState init', input);
        if(input instanceof TGame) this.Room = input
        else if(input instanceof TeXRoomState) this.Room = input.Room; 
        else if(input.Room) this.Room = input.Room;
        else this.Room = input;
    }
    /** @param {TeXRoomState} RoomState  */
    upgrade(RoomState) { console.log('upgradeState to ', RoomState); return this.Room.upgradeState(RoomState); }
}
/** @typedef {(ctx:ConnectionContext)=>any} ctxHandler */
/** @template T @typedef {(ctx:ConnectionContext)=>T} ctxHandlerT */
/** @param {int} rsid */
function RoomState(rsid) { return class RoomState extends TeXRoomState { RoomState = rsid }; };
class WaitingState extends RoomState(0) {
    players = [];
    /** @type {ctxHandlerT<void|true>} */
    connect(ctx) {
        const connres = this.players.push(ctx.user)<=2;
        if(this.players.length >= 2) 
            ((this.players.length = 2), this.upgrade(LaunchingState.fromWaitingState(this)), true);
        return connres;
    }
    /** @type {ctxHandlerT<void|true>} */
    disconnect(ctx) {
        if(this.players.length === 1 && this.players[0].userId === ctx.user.userId) return ((this.players.length = 0), true);
        else console.log('Гонка запросов, сначала апгрейд комнаты до лаунча, а потом дисконнет, это при двух егроках');
    }
    json() { return { RoomState: this.RoomState, players: this.players} }
    updata() { return this.json(); }
}
class TimeVal { // TimeValTiro
    /** @type {Number}  */
    timeval
    /** @param {Number} ms  */
    constructor(ms) { 
        this.timeval = ms;
    }
    /** @param {Number} secs  */
    static SECONDS(secs) { return new TimeVal(secs*1000); }

    start(CB) { // start properties distance ...
        const Timer = this;
        Timer._timestamp = timestamp();//for distance function
        // setTimeout(CB, this.timeval);
        const StopableDecorator = (CB)=>()=>Timer._stopped?null:CB();
        const PausableDecorator = (CB)=>()=>Timer._pause?(Timer._CB = CB):CB();
        setTimeout(StopableDecorator(CB), this.timeval);
    }
    stop() { return this._stopped = true; }
    pauseWhile(CB) {
        const Timer = this;
        Timer._pause = true;
        res = CB();
        Timer._pause = false;
        if(Timer._CB) Timer._CB();
        return res;
    }

    value() { return this.timeval; }
    json() { return this; }
    distance() { return this.timeval - (timestamp() - this.timestamp); }
}
class LaunchingState extends RoomState(1) {
    players = [];
    timeval = TimeVal.SECONDS(5);
    getPlayerByID(_userId) { return this.players.filter(({userId})=>userId === _userId)[0]; }

    constructor(upgradable, players) { super(upgradable); this.players = players; this.timeval.start(()=>this.upgrade(DiceTeamRollState.fromLaunchingState(this))); }
    /** @param {WaitingState} wstate  */
    static fromWaitingState(wstate) {
        return new LaunchingState(wstate, wstate.players);
    }
    json() { return {
        RoomState: this.RoomState,
        players: this.players,
        timeval: this.timeval.json()
    }}
    updata() { return { RoomState: this.RoomState, players: this.players, timeval: this.timeval.json() }; }
}
class DiceTeamRollState extends RoomState(2) {
    players = [];
    /** Если кубики брошены, будут записаны здесь @type {[int, int]}*/
    Dices = [0, 0];
    timeval = TimeVal.SECONDS(30);
    getPlayerByID(_userId) { return this.players.filter(({userId})=>userId === _userId)[0]; }
    
    constructor(upgradable, players) { super(upgradable); this.players = players; this.timeval.start(this.timerlose()); }
    /** @param {LaunchingState} wstate  */
    static fromLaunchingState(lstate) {
        return new LaunchingState(lstate, lstate.players);
    }

    timerlose() {
        return ()=>{
            //what to do? close room?
        }
    }
    roolDice(ctx) {
        for(const [index, player] of Object.entries(this.players)) 
            if(+player.userId===+ctx.user.userId&&this.Dices[index]) 
                this.Room.event('diceTeamRoll', {value:this.Dices[index] = getRandomInt(1,6)});
        if(this.Dices.reduce((acc,val)=>acc===val)) 
            (this.upgrade(this), this.timeval.stop(), this.timeval = TimeVal.SECONDS(30).start(this.timerlose()));
        if(this.Dices.reduce((acc,val)=>!!acc&&!!val))
            (this.upgrade(GameStarted.fromDiceTeamRollState(this)), this.timeval.stop());
        return {result:'nope'};
    }

    json() { return this.updata(); }
    updata() { return { RoomState: this.RoomState, players: this.players, Dices:this.Dices, timeval: this.timeval.json() }; }
}
class GameStarted extends RoomState(3) {
    players;
    Timers = new Timers;
    Slots = adv0_range(0, 24, { 0:[15,1], 12:[15,2], null:()=>[0,0] });
    Drops = { whiteover: 0, blackover: 0 };
    Dices = GameStarted._rollDices();
    ActiveTeam = WHITEID;

    getPlayerByID(_userId) { return this.players.filter(({userId})=>userId === _userId)[0]; }
    get opponent() { return this.players.filter(({team})=>team !== this.ActiveTeam)[0]; }

    constructor(upgradable, players) { super(upgradable); this.players = players; this.Timers.curTimer = this.ActiveTeam; }
    /** @param {DiceTeamRollState} wstate  */
    static fromDiceTeamRollState({Room, players, Dices}) {
        const [d1, d2] = Dices;
        [players[0].team, players[1].team] = d1 > d2?[WHITEID, BLACKID]:[BLACKID, WHITEID];
        return new GameStarted(Room, players);
    }

    static _rollDices() { return [getRandomInt(1, 6), getRandomInt(1, 6)]; }
    stepIfValid(user, step, code) {
        const result = this.Timers.curTimer.pauseWhile(()=>{//at the end ifn stopped/successed timer, this will be resumed;
            const {ActiveTeam, Dices} = this;
            
            const player = this.getPlayerByID(user.userId);
            if(!player) return ((console.log('nope', this.Players), {result:'nope', user, player}))
            if(!(player.debugger || player.team === ActiveTeam)) return ((console.log('nope', this.Players), {result:'nope', user, player}))

            //implement GameLogistics here
            step.map(({from, to, points})=>{
                this.slot(from).take(ActiveTeam);
                this.slot(to).add(ActiveTeam);
                // typeof to === 'string' && to = 
            });
            this.Timers.curTimer.success();//if succes step
            return true;
        });
        
        if(result===true) {
            const prevstate = { ActiveTeam:this.ActiveTeam, Dices:this.Dices };
            this.event('step', {step, prevstate, code})
            if(this.Drops['whiteover'] === 15 || this.Drops['blackover'] === 15) 
                this.endGame(this.ActiveTeam, 'Player dropped all chekers', 'win');
            else this.nextStep();
            return {result:'success'};
        } else {

            return {result:'nope'};
        }
    }
    nextStep() {
        const Dices = this.Dices = this.opponent().autodice?GameStarted._rollDices():[0, 0];
        const ActiveTeam = this.ActiveTeam = nextTeamDict[this.ActiveTeam];
        this.event('state', { Dices, ActiveTeam })
        this.Timers.curTimer = ActiveTeam;
    }
    rollDice(ctx) {
        if(this.getPlayerByID(ctx.userId)?.team !== this.ActiveTeam) return {result:'nope'};
        this.Dices = GameStarted._rollDices();
        this.event('state', {newstate: this.nextState()});
    }
    endGame(WinnerTeam, msg, code) {
        if(!Debug.TimersTurn&&code === 'timer') return; //debig
        if(this.RoomState === CONSTANTS.RoomStates.end) return;
        this.RoomState = CONSTANTS.RoomStates.end;
        this.event('end', {winner: WinnerTeam, msg, code});
        this.Timers.off();
        this.Room.events.onfinish.send();
    }


    json() { return {
        RoomState: this.RoomState,
        ActiveTeam: this.ActiveTeam,
        players: this.players,
        Timers: this.Timers.json(),
        Slots: this.Slots,
        Drops: this.Drops,
        Dices: this.Dices,
    }}
    updata() { return this.json(); }
}