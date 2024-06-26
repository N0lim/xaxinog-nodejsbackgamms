import { FCPromise, RewritablePromiseEmit } from "./Utilities.js";



function log(name) { return ()=>console.log(name); }
export const lobbyhubReady = FCPromise();
lobbyhubReady.then(log('lobbyhub'));
export const WSEventPoolReady = FCPromise();
WSEventPoolReady.then(log('WSEventPool'));
export const popupsinited = FCPromise();
popupsinited.then(log('popups'));
export const siteLanguageInited = new RewritablePromiseEmit();
siteLanguageInited.then(log('siteLanguage'));
/** @returns {Promise.<import("./../../../json/bets.json")>} */
const loadBetsInfo = ()=>fetch("./json/bets.json").then(localize=>localize.json())
export const BetsLoaded = loadBetsInfo();
BetsLoaded.then(bets=>console.log('bets'));

function whileundefined(nameCallBack, oncomplete) {
    const periodicChecker = setInterval(()=>{
        try{
            nameCallBack()
                ?(clearInterval(periodicChecker), oncomplete?.())
                :null
        } catch (e) {}
    }, 30);
}

export const fabricsloaded = new Promise(resolve=>whileundefined(()=>fabric, resolve));
fabricsloaded.then(log('fabric'));
export const swipersloaded = new Promise(resolve=>whileundefined(()=>Swiper, resolve));
swipersloaded.then(log('Swiper'));
export const axiosloaded = new Promise(resolve=>whileundefined(()=>axios, resolve));
axiosloaded.then(log('axios'));
