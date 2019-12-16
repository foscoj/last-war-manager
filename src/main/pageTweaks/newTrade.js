import config from 'config/lwmConfig';
import {
  gmConfig, siteWindow, gmSetValue, lwmJQ,
} from 'config/globals';
import {
  throwError, checkCoords,
} from 'utils/helper';
import { getPromise } from 'utils/loadPromises';
import { Sentry } from 'plugins/sentry';
import driveManager from 'plugins/driveManager';
import { createElementFromHTML, docQuery } from 'utils/domHelper';

const pi = (x) => parseInt(x, 10);
const isPremium = () => siteWindow.premium_account === 1;

export default () => {
  config.promises.content = getPromise('#newTradeOfferDiv');
  config.promises.content.then(() => {
    // remove original save all button
    if (isPremium()) docQuery('[onclick*=\'inputFullResource\']').parentNode.removeChild(docQuery('[onclick*=\'inputFullResource\']'));
    // move buttons into one row and extend colspan
    const lastTR = docQuery('#newTradeOfferDiv tr:last-child');
    lastTR.querySelector('td:nth-child(1)').style.display = 'none';
    lastTR.querySelector('td:nth-child(2)').setAttribute('colspan', '4');
    const divSave = createElementFromHTML('<div class="lwm-trade-coords" style=\'width:100%\'></div>');
    lastTR.querySelector('td:nth-child(2)').appendChild(divSave);
    lastTR.querySelector('td:nth-child(2)').appendChild(createElementFromHTML('<div class="buttonRow lwm-buttonRow2" style="width: 100%; margin-left: 0;"></div>'));
    lastTR.querySelector('.lwm-buttonRow2').appendChild(docQuery('.formButtonNewMessage'));

    // remove clutter and rebuild trade ui
    lwmJQ('#newTradeOfferDiv td:eq(1),#newTradeOfferDiv td:eq(3)').contents().filter((i, el) => el.nodeName !== 'INPUT').remove();
    lwmJQ('#newTradeOfferDiv th:eq(0), #newTradeOfferDiv th:eq(2), #newTradeOfferDiv td:eq(0), #newTradeOfferDiv td:eq(2)').remove();
    lwmJQ('#newTradeOfferDiv th').attr('colspan', '4')
      .prepend('Koordinaten:&nbsp;')
      .append('<select id="lwm-own-coords"></select>')
      .append(`<div>(Handelsgebühr: ${siteWindow.lose}%)</div>`);
    lwmJQ('#newTradeOfferDiv td:eq(0)').prepend('<div><h3><u>Angebot</u></h3></div>');
    lwmJQ('#newTradeOfferDiv td:eq(1)').prepend('<div><h3><u>Forderung</u></h3></div>');

    // save coords in lastused config
    const savedCoords = config.lwm.lastTradeCoords[config.gameData.playerID][config.gameData.planetCoords.string];
    docQuery('[onclick*=\'submitNewOfferTrade\']').addEventListener('click', () => {
      const coords = [parseInt(docQuery('#galaxyTrade').value, 10), parseInt(docQuery('#systemTrade').value, 10), parseInt(docQuery('#planetTrade').value, 10)];
      const check = config.gameData.planets.filter((p) => parseInt(p.galaxy, 10) === coords[0]
            && parseInt(p.system, 10) === coords[1]
            && parseInt(p.planet, 10) === coords[2]);
      if (!check.length && !savedCoords.includes(`${coords[0]}x${coords[1]}x${coords[2]}`) && checkCoords(coords)) {
        savedCoords.unshift(`${coords[0]}x${coords[1]}x${coords[2]}`);
        if (savedCoords.length > gmConfig.get('coords_trades')) {
          savedCoords.length = gmConfig.get('coords_trades');
        }
        gmSetValue('lwm_lastTradeCoords', JSON.stringify(config.lwm.lastTradeCoords));
        if (gmConfig.get('confirm_drive_sync')) driveManager.save();
      }
    });

    // add button to save all res
    const buttonSaveAll = createElementFromHTML('<a class="formButtonNewMessage" style="float: none;" href="#">All Resourcen sichern</a>');
    if (isPremium()) {
      buttonSaveAll.addEventListener('click', () => {
        docQuery('#my_eisen').value = Math.round((siteWindow.Roheisen - ((siteWindow.Roheisen * siteWindow.lose) / 100)));
        docQuery('#my_kristall').value = Math.round((siteWindow.Kristall - ((siteWindow.Kristall * siteWindow.lose) / 100)));
        docQuery('#my_frubin').value = Math.round((siteWindow.Frubin - ((siteWindow.Frubin * siteWindow.lose) / 100)));
        docQuery('#my_orizin').value = Math.round((siteWindow.Orizin - ((siteWindow.Orizin * siteWindow.lose) / 100)));
        docQuery('#my_frurozin').value = Math.round((siteWindow.Frurozin - ((siteWindow.Frurozin * siteWindow.lose) / 100)));
        docQuery('#my_gold').value = Math.round((siteWindow.Gold - ((siteWindow.Gold * siteWindow.lose) / 100)));
        if (docQuery('#his_eisen').value === '0') docQuery('#his_eisen').value = '1';
        docQuery('#his_gold').value = '0';
        docQuery('#tradeOfferComment').value = '';
      });
      lastTR.querySelector('td:nth-child(2) .buttonRow').appendChild(buttonSaveAll);
    }

    // add button to secure all res
    const buttonSecureAll = createElementFromHTML('<a class="formButtonNewMessage" style="float: none;" href="#">Savehandel</a>');
    if (isPremium()) {
      buttonSecureAll.addEventListener('click', () => {
        buttonSaveAll.click();
        docQuery('#his_gold').value = '99999999';
        docQuery('#his_eisen').value = '0';
        docQuery('#tradeOfferComment').value = '###LWM::SAVE###';
      });
      lastTR.querySelector('td:nth-child(2) .buttonRow').appendChild(buttonSecureAll);
    }

    // add own chords to select
    const select = docQuery('#lwm-own-coords');
    select.appendChild(createElementFromHTML('<option value=\'\'>Planet wählen</option>'));
    select.addEventListener('change', () => {
      if (select.value === '') {
        docQuery('#galaxyTrade').value = '';
        docQuery('#systemTrade').value = '';
        docQuery('#planetTrade').value = '';
      } else {
        docQuery('#galaxyTrade').value = config.gameData.planets[select.value].galaxy;
        docQuery('#systemTrade').value = config.gameData.planets[select.value].system;
        docQuery('#planetTrade').value = config.gameData.planets[select.value].planet;
      }
    });
    config.gameData.planets.forEach((coords, i) => {
      if (pi(coords.galaxy) === siteWindow.my_galaxy
            && pi(coords.system) === siteWindow.my_system
            && pi(coords.planet) === siteWindow.my_planet) return true;
      const option = createElementFromHTML(`<option value='${i}'>${coords.galaxy}x${coords.system}x${coords.planet}</option>`);
      select.appendChild(option);

      return true;
    });

    // add div with saved coords
    const linksSave = [];
    savedCoords.forEach((coords) => {
      const link = createElementFromHTML(`<a href='javascript:void(0)'>${coords}</a>`);
      link.addEventListener('click', () => {
        [docQuery('#galaxyTrade').value, docQuery('#systemTrade').value, docQuery('#planetTrade').value] = coords.split('x');
      });
      linksSave.push(link);
    });
    linksSave.forEach((l, i) => {
      divSave.appendChild(l);
      divSave.appendChild(i !== linksSave.length - 1 ? createElementFromHTML('&nbsp;-&nbsp;') : createElementFromHTML('<div></div>'));
    });

    config.loadStates.content = false;
  }).catch((e) => {
    Sentry.captureException(e);
    console.log(e);
    throwError();
    config.loadStates.content = false;
  });
};