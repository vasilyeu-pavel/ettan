const { URL, URLSearchParams } = require('url');
const fetch = require('node-fetch');
const jsdom = require('jsdom');
const {
    auth,
    getCookies,
    cookiesParser,
    delay,
} = require('../../../utils');
const config = require('../../../../config');

const getAuthToken = async (
    {
        page,
        signInSelector,
        cookiesModalSelector,
        parserName
    }
) => {
    try {
        await page.evaluate((selector) => document.querySelector(selector).click(), signInSelector);
    }
    catch (e) {
        console.log('====signInSelector====', e);
    }

    await page.waitFor(3000);

    // get all loaded iframes
    const framesSrc = await page.evaluate((s) => [...document.querySelectorAll('iframe')].map((f) => f.src));
    // filter iframes by target needed
    const filteredSrc = framesSrc.filter((src) => src.includes('nelonenmedia'));

    if (!filteredSrc.length) throw new Error('Ruutu auth frame is not loaded');

    // go to redirect_url
    await page.goto(filteredSrc[0]);

    await page.waitFor(1000);

    // enter sign in form

    await auth(page, parserName);

    await page.waitFor(5000);

    // get cookies
    const cookies = await getCookies(page);

    const parsedCookies = cookiesParser(cookies, 'gatling_token');

    return parsedCookies;
};

const getUrl = (link, config) => {
    const url = new URL(link);
    url.search = new URLSearchParams(config);

    return url;
};

const getMatchId = (parseredResponse) => {
    const filteredRsponse = [];
    parseredResponse.items.forEach((el) => {
        filteredRsponse.push({
            id: el.id,
            name: el.title.split(', Fanikamera ')[0],
            date: el.title.split(', Fanikamera ')[1]
        });
    });

    return filteredRsponse;
};

const requestFromManifest = async (gatling_token, match) => {
    const { JSDOM } = jsdom;
    const url = getUrl('https://gatling.nelonenmedia.fi/media-xml-cache', {
        id: match.id,
        v: 2
    });

    const response = await fetch(url);
    const parseredResponse = await response.text();
    const dom = new JSDOM(parseredResponse);
    const manifest = `${dom.window.document.querySelector('SamsungMediaFile').innerHTML.split('/play')[0]}/playlist.m3u8`;
    const timestamp = `timestamp=${new Date().getTime()}`;

    return {
        // eslint-disable-next-line camelcase,max-len
        url: `https://gatling.nelonenmedia.fi/auth/access/v2?stream=${manifest.split('/').join('%2f')}&${timestamp}&${gatling_token}`,
        ...match
    };
};

const getLeagueMatches = async ({ parserName, league }) => {
    const leagueOptions = config[parserName].leaguesOptions[league];

    const response = await fetch(getUrl(
        'https://prod-component-api.nm-services.nelonenmedia.fi/api/component/26611',
        leagueOptions
    ));

    const parsedResponse = await response.json();

    return getMatchId(parsedResponse);
};

const getDateFromName = (name) => {
    const parsedName = name.split(' ');

    return parsedName[parsedName.length - 1];
};

const getMatches = async (gatling_token = 'gatling_token', d = convertDate(new Date()), parserName, league) => {
    const matches = await getLeagueMatches({ parserName, league });

    const result = await Promise.all(matches.map(requestFromManifest.bind(null, gatling_token)));

    const filteredReslut = [];

    result.forEach((item) => {
        [d].forEach((date) => {
            if (!item.date) {
                if (getDateFromName(item.name) === date) {
                    filteredReslut.push(item);
                }
            }
            if (item.date === date) filteredReslut.push(item);
        });
    });

    const matchesToDownload = [];

    for (const { url, ...matchOptions } of filteredReslut) {
        const manifestWithToken = await fetch(`${url}`);
        const urlWithToken = await manifestWithToken.text();
        await delay(2000);

        matchesToDownload.push({
            ...matchOptions,
            league,
            name: matchOptions.name.replace(/ /g, ''),
            url: urlWithToken
        });
    }

    return matchesToDownload;
};

const convertDate = (targetDate) => {
    const date = new Date(targetDate);
    const d = date.getDate();
    const m = date.getMonth() + 1;

    return `${d}.${m}.`;
};

module.exports = {
    getAuthToken,
    getMatches,
    convertDate
};
