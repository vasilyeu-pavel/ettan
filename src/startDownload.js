const ipc = require('node-ipc');

const { MAIN_PROCESS, PROCESS } = require('./constants');
const { parseArgv } = require("./utils");
const { sendTelegramMessage } = require('./telegramBot');
const formatDate = require('./utils/formatDate');
const { runCmdHandler } = require('./utils/runCmdHandler');

ipc.config.id = `${process.pid}`;
ipc.config.retry = 1500;
ipc.config.silent = true;

const startDownload = async () => {
    const match = parseArgv(process.argv);
    const {
        name,
        url,
        date,
        league,
        options = "--hls-prefer-native",
        index,
    } = match;
    console.log(`This process is pid ${process.pid}`);

    const matchName = name.replace(/ /g, '');

    const savedName = `${league}/${formatDate(date)}_${matchName}.mp4`;

    const ydlCmd = `youtube-dl ${options} ${url} --output ${savedName}`;

    await runCmdHandler('/parsers/src/youtube-dl', ydlCmd);

    await sendTelegramMessage({ matches: [match] });

    return { index, matchName };
};

ipc.connectTo(MAIN_PROCESS, () => {
    ipc.of[MAIN_PROCESS].on('connect', async () => {
        const { matchName, index } = await startDownload();
        console.log(index, matchName);
        ipc.of[MAIN_PROCESS].emit(PROCESS[index], matchName);
        console.log('Exiting.');
        process.kill(process.pid);
    });
});
