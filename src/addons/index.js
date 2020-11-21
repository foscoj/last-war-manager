import {
  siteWindow, lwmJQ, gmSetValue, gmGetValue,
} from 'config/globals';
import gmConfig from 'plugins/GM_config';
import {
  getObsInfo, getSpionageInfo, getFlottenbewegungenInfo, getTradeOffers,
} from 'utils/requests';
import config from 'config/lwmConfig';
import { getIncomingResArray } from 'utils/helper';
import moment from 'moment';
import momentDurationFormatSetup from 'moment-duration-format';
import driveManager from 'plugins/driveManager';
import * as workerTimers from 'worker-timers';

import showFleetActivityGlobally, { killFleetActivityTimer } from 'addons/fleetActivity';
import addCustomResourceCounter from 'addons/resourceTicks';

momentDurationFormatSetup(moment);

const domQuery = (query) => siteWindow.document.querySelector(query);

const addOns = {
  config: {
    tradeRefreshInterval: null,
    capacityRefreshInterval: null,
    clockInterval: null,
    resourceIntervals: null,
    clockIntervalTime: new Date(),
  },
  load() {
    if (gmConfig.get('addon_fleet') && config.loadStates.lastLoadedPage !== 'flottenbewegungen') {
      if (!Object.keys(config.gameData.spionageInfos).length || !Object.keys(config.gameData.observationInfo).length) {
        getObsInfo()
          .then(() => getSpionageInfo())
          .then(() => { getFlottenbewegungenInfo(); });
      } else {
        getFlottenbewegungenInfo();
      }
    }

    addOns.refreshTrades();
    if (gmConfig.get('addon_clock')) addOns.addClockInterval();
    if (gmConfig.get('res_updates') && addOns.config.resourceIntervals === null) {
      addOns.config.resourceIntervals = addOns.addCustomResourceCounter();
    }
  },
  unload() {
    killFleetActivityTimer();
    if (addOns.config.capacityRefreshInterval !== null) {
      workerTimers.clearInterval(addOns.config.capacityRefreshInterval);
      addOns.config.capacityRefreshInterval = null;
    }
    if (addOns.config.clockInterval !== null) { workerTimers.clearInterval(addOns.config.clockInterval); addOns.config.clockInterval = null; }
    if (addOns.config.resourceIntervals !== null) {
      addOns.config.resourceIntervals();
      addOns.config.resourceCounter = null;
    }
  },
  // refresh trades every minute to make it unnecessary to visit the trade page for trade to go through
  refreshTrades() {
    // always refresh trades once after login or planet change
    if (config.firstLoad) getTradeOffers();

    // refresh interval
    if (addOns.config.tradeRefreshInterval !== null) return; // allready installed
    addOns.config.tradeRefreshInterval = workerTimers.setInterval(() => {
      getTradeOffers();
    }, 60000);
  },
  // checks whether trades would surpass resource capacities and highlights a warning
  checkCapacities() {
    if (!gmConfig.get('trade_highlights')) return;
    const capacities = siteWindow.resourceCapacityArray;
    const resSpans = [domQuery('#roheisenAmount'), domQuery('#kristallAmount'), domQuery('#frubinAmount'), domQuery('#orizinAmount'), domQuery('#frurozinAmount'), domQuery('#goldAmount')];
    const currentRes = [siteWindow.Roheisen, siteWindow.Kristall, siteWindow.Frubin, siteWindow.Orizin, siteWindow.Frurozin, siteWindow.Gold];
    const incomingRes = getIncomingResArray();

    currentRes.forEach((amount, i) => {
      if (amount + incomingRes[i] > capacities[i]) resSpans[i].classList.add('redBackground');
      else resSpans[i].classList.remove('redBackground');
    });

    // add invterval
    if (addOns.config.capacityRefreshInterval === null) {
      addOns.config.capacityRefreshInterval = workerTimers.setInterval(() => {
        addOns.checkCapacities();
      }, 10000);
    }
  },
  addClockInterval() {
    if (addOns.config.clockInterval !== null) return;
    addOns.config.clockIntervalTime = new Date();
    addOns.config.clockInterval = workerTimers.setInterval(() => {
      const now = new Date();
      const deltaTime = (now - addOns.config.clockIntervalTime) / 1000;
      addOns.config.clockIntervalTime = now;
      lwmJQ('[id*=\'clock\'],[id*=\'Clock\']').each((i, el) => {
        const self = lwmJQ(el);
        // skip elements that don't have data attribute
        if (typeof self.data('clock_seconds') === 'undefined') return true;

        const data = parseFloat(self.data('clock_seconds')) - deltaTime;
        self.data('clock_seconds', data);
        if (data < 0) {
          self.html('--:--:--');
        } else {
          const md = moment.duration(parseInt(data, 10), 'seconds');
          self
            .attr('title', moment().add(parseInt(data, 10), 'seconds').format('YYYY-MM-DD HH:mm:ss'))
            .addClass('popover')
            .html(md.format('HH:mm:ss', {
              trim: false,
              forceLength: true,
            }));
        }

        if (config.loadStates.lastLoadedPage === 'ubersicht') {
          config.gameData.overviewInfo.arrayForInitClock.forEach((clockData) => {
            if (self.attr('id') === clockData.clock_id) {
              const progressBar = siteWindow.document.querySelector(`#${clockData.progress_bar_id} > div ul`);
              progressBar.style.width = `${((clockData.total_secounds - self.data('clock_seconds')) / clockData.total_secounds) * 100}%`;
              return false;
            }
            return true;
          });
        }

        if (config.loadStates.lastLoadedPage === 'research') {
          const progressBar = siteWindow.document.querySelector('.loadbarResearch');
          if (progressBar) {
            progressBar.style.width = `${((config.gameData.researchInfo.total_secounds_research - config.gameData.researchInfo.secounds_research) / config.gameData.researchInfo.total_secounds_research) * 100}%`;
          }
        }

        if (config.loadStates.lastLoadedPage === 'construction') {
          const progressBar = siteWindow.document.querySelector(`#constructionProgressBar_1_${config.gameData.constructionInfo.BuildingNumber}`);
          if (progressBar) {
            progressBar.parentNode.style.width = `${((config.gameData.constructionInfo.total_secounds1 - config.gameData.constructionInfo.secounds_building1) / config.gameData.constructionInfo.total_secounds1) * 100}%`;
          }

          const multiProgressBar = siteWindow.document.querySelector(`#constructionProgressBar_1_${config.gameData.constructionInfo.BuildingNumber2}`);
          if (multiProgressBar) {
            multiProgressBar.parentNode.style.width = `${((config.gameData.constructionInfo.total_secounds2 - config.gameData.constructionInfo.secounds_building2) / config.gameData.constructionInfo.total_secounds2) * 100}%`;
          }
        }

        return true;
      });
    }, 1000);
  },
  showFleetActivityGlobally,
  addCustomResourceCounter,
  calendar: {
    storeOverview(data) {
      const dataBuildingBefore = JSON.stringify(addOns.calendar.getData('building', config.gameData.playerID));
      addOns.calendar.deleteCat('building', config.gameData.playerID);
      lwmJQ.each(data.all_planets_for_use, (i, planet) => {
        const coords = `${planet.galaxy_pom}x${planet.system_pom}x${planet.planet_pom}`;
        if (planet.BuildingName !== '') {
          addOns.calendar.store({
            playerID: config.gameData.playerID,
            playerName: config.gameData.playerName,
            coords,
            type: 'building',
            name: planet.BuildingName,
            text: planet.BuildingName,
            duration: 0,
            ts: moment(planet.FinishTimeForBuilding).valueOf(),
          });
        }

        if (planet.BuildingName2 !== '') {
          addOns.calendar.store({
            playerID: config.gameData.playerID,
            playerName: config.gameData.playerName,
            coords,
            type: 'building',
            name: planet.BuildingName2,
            text: planet.BuildingName2,
            duration: 0,
            ts: moment(planet.FinishTimeForBuilding2).valueOf(),
          });
        }
      });
      const dataBuildingAfter = JSON.stringify(addOns.calendar.getData('building', config.gameData.playerID));

      const dataResearchBefore = JSON.stringify(addOns.calendar.getData('research', config.gameData.playerID));
      addOns.calendar.deleteCat('research', config.gameData.playerID);
      if (typeof data.research_info !== 'undefined' && data.research_info.ResearchName !== '') {
        addOns.calendar.store({
          playerID: config.gameData.playerID,
          playerName: config.gameData.playerName,
          coords: `${data.research_info.researchGalaxy}x${data.research_info.researchSystem}x${data.research_info.researchPlanet}`,
          type: 'research',
          name: data.research_info.ResearchName,
          text: data.research_info.ResearchName,
          duration: 0,
          ts: moment(data.research_info.FinishTime).valueOf(),
        });
      }
      const dataResearchAfter = JSON.stringify(addOns.calendar.getData('research', config.gameData.playerID));

      gmSetValue('lwm_calendar', JSON.stringify(config.lwm.calendar));
      if ((!addOns.calendar.truncateData() || dataResearchBefore !== dataResearchAfter || dataBuildingBefore !== dataBuildingAfter) && gmConfig.get('confirm_drive_sync')) driveManager.save();
    },
    storeFleets(data) {
      const lang = config.const.lang.fleet;
      const dataTypes = ['all_informations', 'buy_ships_array', 'dron_observationens', 'dron_planetenscanners', 'fleet_informations', 'send_infos'];
      const dataFleetBefore = JSON.stringify(addOns.calendar.getData('fleet', config.gameData.playerID, config.gameData.planetCoords.string));

      // delete fleets with come time older than seven days
      // this fixes a bug that caused defending fleets from previous round to remain in the calendar data
      config.lwm.calendar = config.lwm.calendar.filter((e) => !(e.type === 'fleet'
        && new Date(e.ts + (1000 * 60 * 60 * 24 * 7)) < new Date()));
      addOns.calendar.deleteCat('fleet', config.gameData.playerID, config.gameData.planetCoords.string);

      lwmJQ.each(dataTypes, (i, type) => {
        lwmJQ.each(data[type], (f, fleetData) => {
          const time = fleetData.ComeTime || fleetData.DefendingTime || fleetData.time;
          if (!time) return true;
          addOns.calendar.store({
            playerID: config.gameData.playerID,
            playerName: config.gameData.playerName,
            coords: config.gameData.planetCoords.string,
            type: 'fleet',
            name: fleetData.id || 0,
            duration: 0,
            text: `Flotte Typ ${lang.types[fleetData.Type] || fleetData.name || 'Handelsposten'} mit Status ${lang.status[fleetData.Status || 1]} und Coords ${fleetData.Galaxy_send || fleetData.galaxy || siteWindow.my_galaxy}x${fleetData.System_send || fleetData.system || siteWindow.my_system}x${fleetData.Planet_send || fleetData.planet || siteWindow.my_planet}`,
            ts: moment(time).valueOf(),
          });
          return true;
        });
      });
      const dataFleetAfter = JSON.stringify(addOns.calendar.getData('fleet', config.gameData.playerID, config.gameData.planetCoords.string));

      gmSetValue('lwm_calendar', JSON.stringify(config.lwm.calendar));
      if (gmConfig.get('confirm_drive_sync') && dataFleetBefore !== dataFleetAfter) driveManager.save();
    },
    storeProd(data) {
      const dataDefenseBefore = JSON.stringify(addOns.calendar.getData('defense', config.gameData.playerID, config.gameData.planetCoords.string));
      addOns.calendar.deleteCat('defense', config.gameData.playerID, config.gameData.planetCoords.string);
      let lastEntry = {};
      let sameEntryCount = 1;
      lwmJQ.each(data.planet_defense, (i, prodData) => {
        const entry = {
          playerID: config.gameData.playerID,
          playerName: config.gameData.playerName,
          coords: config.gameData.planetCoords.string,
          type: 'defense',
          name: prodData.name,
          text: prodData.name,
          duration: prodData.sati * 60 * 60 + prodData.minuti * 60 + prodData.sekunde,
          ts: moment(prodData.finishTime).valueOf(),
        };
          // for same tasks (like upgrades) < 1 hour, just edit the last entry so that calendar doesn't get too big
        if (lastEntry.type === entry.type
            && lastEntry.name === entry.name
            && lastEntry.duration < (60 * 60)
            && lastEntry.duration === entry.duration) {
          sameEntryCount += 1;
          config.lwm.calendar[config.lwm.calendar.length - 1].text = `${sameEntryCount}x ${prodData.name} (every ${moment.duration(lastEntry.duration, 'seconds').format('HH:mm:ss', { trim: false, forceLength: true })})`;
          config.lwm.calendar[config.lwm.calendar.length - 1].ts = moment(prodData.finishTime).valueOf();
        } else {
          sameEntryCount = 1;
          addOns.calendar.store(entry);
        }
        lastEntry = entry;
      });
      const dataDefenseAfter = JSON.stringify(addOns.calendar.getData('defense', config.gameData.playerID, config.gameData.planetCoords.string));

      const dataShipsBefore = JSON.stringify(addOns.calendar.getData('ships', config.gameData.playerID, config.gameData.planetCoords.string));
      addOns.calendar.deleteCat('ships', config.gameData.playerID, config.gameData.planetCoords.string);
      lastEntry = {};
      sameEntryCount = 1;
      lwmJQ.each(data.ships, (i, prodData) => {
        const entry = {
          playerID: config.gameData.playerID,
          playerName: config.gameData.playerName,
          coords: config.gameData.planetCoords.string,
          type: 'ships',
          name: prodData.name,
          text: prodData.name,
          duration: prodData.sati * 60 * 60 + prodData.minuti * 60 + prodData.sekunde,
          ts: moment(prodData.finishTime).valueOf(),
        };
          // for same tasks (like upgrades) < 1 hour, just edit the last entry so that calendar doesn't get too big
        if (lastEntry.type === entry.type
            && lastEntry.name === entry.name
            && lastEntry.duration < (60 * 60)
            && lastEntry.duration === entry.duration) {
          sameEntryCount += 1;
          config.lwm.calendar[config.lwm.calendar.length - 1].text = `${sameEntryCount}x ${prodData.name} (every ${moment.duration(lastEntry.duration, 'seconds').format('HH:mm:ss', { trim: false, forceLength: true })})`;
          config.lwm.calendar[config.lwm.calendar.length - 1].ts = moment(prodData.finishTime).valueOf();
        } else {
          sameEntryCount = 1;
          addOns.calendar.store(entry);
        }
        lastEntry = entry;
      });
      const dataShipsAfter = JSON.stringify(addOns.calendar.getData('ships', config.gameData.playerID, config.gameData.planetCoords.string));

      gmSetValue('lwm_calendar', JSON.stringify(config.lwm.calendar));
      if (gmConfig.get('confirm_drive_sync') && (dataDefenseBefore !== dataDefenseAfter || dataShipsBefore !== dataShipsAfter)) driveManager.save();
    },
    storeTrades(data) {
      const dataTradesBefore = JSON.stringify(addOns.calendar.getData('trades', config.gameData.playerID, config.gameData.planetCoords.string));
      addOns.calendar.deleteCat('trades', config.gameData.playerID, config.gameData.planetCoords.string);
      lwmJQ.each(data.trade_offers, (i, tradeData) => {
        if (parseInt(tradeData.galaxy, 10) === parseInt(config.gameData.planetCoords.galaxy, 10)
            && parseInt(tradeData.system, 10) === parseInt(config.gameData.planetCoords.system, 10)
            && parseInt(tradeData.planet, 10) === parseInt(config.gameData.planetCoords.planet, 10)) return true;
        addOns.calendar.store({
          playerID: config.gameData.playerID,
          playerName: config.gameData.playerName,
          coords: config.gameData.planetCoords.string,
          type: 'trades',
          text: `Trade ${tradeData.my ? 'with ' : 'from '}${tradeData.galaxy}x${tradeData.system}x${tradeData.planet} (${tradeData.accept === '1' ? 'Running' : 'Pending'})${tradeData.comment}`,
          ts: moment(tradeData.accept === '0' ? tradeData.time.replace(/\//g, '-') : tradeData.time_acc.replace(/\//g, '-')).valueOf(),
        });
        return true;
      });
      const dataTradesAfter = JSON.stringify(addOns.calendar.getData('trades', config.gameData.playerID, config.gameData.planetCoords.string));

      gmSetValue('lwm_calendar', JSON.stringify(config.lwm.calendar));
      if (gmConfig.get('confirm_drive_sync') && dataTradesBefore !== dataTradesAfter) driveManager.save();
    },
    store(data) {
      const check = config.lwm.calendar.filter((entry) => JSON.stringify(entry) === JSON.stringify(data));
      if (check.length === 0) {
        // not found, add!
        config.lwm.calendar.push(data);
      }
    },
    truncateData() {
      const dataBefore = JSON.stringify(addOns.calendar.getData());
      config.lwm.calendar = config.lwm.calendar.filter((entry) => entry.ts > moment().valueOf());
      const dataAfter = JSON.stringify(addOns.calendar.getData());

      return dataBefore === dataAfter;
    },
    deleteCat(cat, playerID, coords = null) {
      config.lwm.calendar = config.lwm.calendar.filter((e) => !(e.type === cat
        && e.playerID === playerID && (e.coords === coords || coords === null)));
      // console.log('deleteCat', cat, playerID, coords, config.lwm.calendar);
    },
    getData(cat = null, playerID = null, coords = null) {
      return config.lwm.calendar.filter((entry) => ((entry.type === cat || cat === null)
      && (entry.playerID === playerID || playerID === null)
      && (entry.coords === coords || coords === null))).sort((a, b) => a.ts - b.ts);
    },
  },
  planetData: {
    storeDataFromSpio() {
      gmGetValue('lwm_planetData_temp', '{}').then((jsonData) => {
        const planetData = JSON.parse(jsonData);

        if (lwmJQ('#buildingsLevel').length === 0) return; // spy not sufficient
        let levelTT = 0;
        const matchTT = lwmJQ('#researchLevel').text().match(/Tarntechnologie (\d+)/);
        if (matchTT === null) levelTT = 0;
        else [, levelTT] = matchTT;

        // save
        const coords = siteWindow.document.querySelector('#tableOS th').textContent.match(/\d*x\d*x\d*/)[0];
        if (typeof planetData[coords] === 'undefined') planetData[coords] = {};
        planetData[coords].Tarntechnologie = parseInt(levelTT, 10);

        // write into temp save because we don't have complete save / load functionality on spy / obs pages
        // the main page will check on the temp save and pick up new values
        gmSetValue('lwm_planetData_temp', JSON.stringify(planetData));
      });
    },
  },
};

export default addOns;
