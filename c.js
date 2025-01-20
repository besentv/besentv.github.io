/**
*   SRTD - SimRail Train Describer
*
*   A train describer for the popular Polish train simulation game,
*   made with love (and not enough time!...) by Angelo :-)
*
*   SPDX-License-Identifier: CC-BY-NC-SA-4.0
*
*/

var settings = {
    server: "int3",
    colour: "grn",
    drawScanLines: true,
    flipped: false,
    showTrainSpeed: false,
    showNextSignalSpeed: false,

    loggingSignalNames: false,
    recording: true,
};
var selectedSetting = Object.keys(settings)[0];
var availableSettings = {
    server: [],
    colour: ["grn", "wht", "org", "gry", "red", "blu"],
    drawScanLines: [true, false],
    flipped: [false, true],
    showTrainSpeed: [false, true],
	showNextSignalSpeed: [false, true],
};

const coloursPalette = {
    "grn": ["#000", "#0F0"],
    "wht": ["#000", "#CCC"],
    "org": ["#000", "#E73"],
    "gry": ["#ccc", "#000"],
    "red": ["#000", "#F00"],
    "blu": ["#000", "#00F"],
    "yel": ["#000", "#FF0"],
}

const serversListUrl = "https://panel.simrail.eu:8084/servers-open";
const constUrl = "https://panel.simrail.eu:8084/trains-open?serverCode=";

var coordinates = {};
var signalDirections = {};

var loggedSignalNames = {};
var recorded = null;

var cnv, ctx;

const textSize = 24;
const textSizeRatio = 2;
const textMargin = 1;

const charsPerRow = 160; // We could simulate ye olde 80 columns... but we won't!
const textLines = 120 / textSizeRatio; // For a proper 4 / 3 CRT monitor!
const screenRatio = charsPerRow / textSizeRatio / textLines; // Used to be fixed at 4 / 3, now it's N lines - way easier to deal with!
const screenWidth = charsPerRow * textSize / textSizeRatio * textMargin;
const screenHeight = screenWidth / screenRatio;

var area = "L001_KO_Zw";
var isCurrentlyFlipped = false;

addEventListener("load", start);

function start() {
    initSettings();
    initCoords();
    initCnv();
    initServersList();
    updateTrainDescriber();
    const interval = setInterval(function () {
            updateTrainDescriber(true);
    }, 5000);
}

function initSettings() {
    let href = window.location.href.split("#");
    if (href.length > 1) {
        let settingsString = href[1];
        let settingId = 0;
        for (let setting of settingsString.split("_")) {
            let settingName = Object.keys(settings)[settingId];
            let setTo = setting;
            if (settingId) {
                setTo = availableSettings[settingName][setTo];
            }
            settings[settingName] = setTo;
            settingId++;
            if (Object.keys(settings)[settingId] == undefined) {
                continue;
            }
        }
    }
    updateTrainDescriber();
}
addEventListener("hashchange", initSettings);

async function getDataFromServer(url = constUrl + settings.server) {
    // https://stackoverflow.com/questions/2499567/how-to-make-a-json-call-to-an-url/2499647#2499647
    const getJSON = async url => {
        const response = await fetch(url);
        return response.json();
    }
    let data;
    await getJSON(url).then(output => data = output);
    return (data);
}

function initCoords() {
    let logUndefinedSignals;
    for (let id in layouts) {
        logUndefinedSignals = [];
        coordinates[id] = {};
        signalDirections[id] = {};
        for (let row in layouts[id]) {
            let signalsList = layouts[id][row].split("'");
            let signalId = 1;
            for (let char in layouts[id][row].split("'")[0]) {
                switch (layouts[id][row][char]) {
                    case "{":
                    case "}":
                        for (let signalName of ("" + signalsList[signalId]).split("%")) {
                            coordinates[id][signalName] = [layouts[id][row][char] == "}" ? char - 5 : char * 1, row * 1];
                            signalDirections[id][signalName] = layouts[id][row][char] == "}" ? 1 : 0;
                            if (signalName != "§" && id != "Settings" && !allSignals.includes(signalName)) {
                                if (signalName == "undefined") {
                                    logUndefinedSignals.push([row, char]);
                                } else {
                                    console.warn("Signal " + signalName + " in layout " + id + " doesn't seem to exist in SimRail!");
                                }
                            }
                        }
                        signalId++;
                        break;
                }
            }
        }
        if (coordinates[id]["§"] != undefined) {
            delete coordinates[id]["§"];
        }
        if (logUndefinedSignals.length) {
            console.warn("Found undefined signals in layout %c" + id + "%c:", "color: #A0A0FF", "color: black", logUndefinedSignals);
        }
        //if (coordinates[id].undefined != undefined) {
        //    console.warn("At least one signal is missing in layout " + id + "! The last one I found was @ ", coordinates[id].undefined)
        //}
    }
}

function initCnv() {
    cnv = document.getElementById("cnv");
    ctx = cnv.getContext("2d", { alpha: false });

    cnv.style.position = "absolute";

    if (window.innerWidth >= window.innerHeight * screenRatio) { // Using a larger monitor
        cnv.style.height = window.innerHeight;
        cnv.style.width = window.innerHeight * screenRatio;
    } else { // Using a thinner monitor
        cnv.width = window.innerWidth;
        cnv.height = window.innerWidth / screenRatio;
    }

    ctx.width = screenWidth;
    ctx.height = screenHeight;

    cnv.width = screenWidth;
    cnv.height = screenHeight;

    document.body.style.overflow = 'hidden';
}

async function initServersList() {
    let servers = await getDataFromServer(serversListUrl);
    let serversList = [];
    for (let server of servers.data) {
        serversList.push(server.ServerCode);
    }
    availableSettings.server = serversList;
}

async function updateTrainDescriber(calledByTimer = false, data = undefined) {
    flipLayouts();
    if (data === undefined) {
        data = await getDataFromServer();
        data = polishData(data);
    }
    addClosedTracks(data);
    drawCanvas(data);

    if (settings.loggingSignalNames) {
        logSignalNames(data);
    }

    recordTrains(data);

    drawVitalSymbol(calledByTimer);
}

function polishData(data) {
    data = locateTrainsWithoutSignalInFront(data);
    for (let i in data.data) {
        delete data.data[i].EndStation;
        delete data.data[i].ServerCode;
        delete data.data[i].StartStation;
        delete data.data[i].TrainName;
        delete data.data[i].Type;
        delete data.data[i].Vehicles;
        delete data.data[i].id;
        delete data.data[i].TrainData.ControlledBySteamID;
    }
    return data;
}

function distance (x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}

function locateTrainsWithoutSignalInFront(data)
{
    if (!recorded) return data;

    for (let i in data.data) 
    {
        let distanceFromLastSeenAtSignal = 0;
        let lastSeenAtSignal = null;

        if (data.data[i].TrainData.SignalInFront !== null) continue;

        for (let train of recorded.data)
        {
            if (train.TrainNoLocal != data.data[i].TrainNoLocal || !train.TrainData.SignalInFront) continue;

            lastSeenAtSignal = train.TrainData.SignalInFront;
            distanceFromLastSeenAtSignal = train.TrainData.DistanceToSignalInFront;
        }

        if (!!lastSeenAtSignal && (lastSeenAtSignal.split("@")[1] == "-Infinity" || distanceFromLastSeenAtSignal > 500))
        {
            data.data[i].TrainData.SignalInFront = lastSeenAtSignal;
            if (distanceFromLastSeenAtSignal > 500)
            {
                console.log(lastSeenAtSignal);
                console.warn(
                    "Train %c" + data.data[i].TrainNoLocal + "%c lost track of signal %c" + lastSeenAtSignal.split("@")[0],
                    "color: #A0A0FF", "", "color: #A0A0FF"
                );
            }
        }
        else if (!!lastSeenAtSignal)
        {
            for (let signal in missingSignals)
            {
                if (missingSignals[signal].includes(lastSeenAtSignal.split("@")[0])) {
                    data.data[i].TrainData.SignalInFront = signal + "@-Infinity";
                    console.log(
                        "Train %c" + data.data[i].TrainNoLocal + "%c passed signal %c" + lastSeenAtSignal.split("@")[0] + "%c; without further information, it's assumed to be heading towards signal %c" + signal,
                        "color: #A0A0FF", "", "color: #A0A0FF", "", "color: #A0A0FF"
                    );
                    break;
                }
                // Just to avoid spamming the log with trains that went missing for a good reason:
                if (signalsLeadingToTheBackrooms.includes(lastSeenAtSignal.split("@")[0])) {
                    data.data[i].TrainData.SignalInFront = lastSeenAtSignal;
                }
            }
        }

        //Last resort: Try finding the train by coordinates.
        if (!data.data[i].TrainData.SignalInFront)
        {
            let lat = data.data[i].TrainData.Latititute;
            let long = data.data[i].TrainData.Longitute;
            //console.log("Checking train " + data.data[i].TrainNoLocal + " by lat " + lat + " long " + long);

            for (let signal in missingSignalsByGPS)
            {
                let distAB = Math.round(distance(...missingSignalsByGPS[signal]) * 1000000) / 1000000;
                let distAC = distance(missingSignalsByGPS[signal][0], missingSignalsByGPS[signal][1], lat, long);
                let distBC = distance(lat, long, missingSignalsByGPS[signal][2], missingSignalsByGPS[signal][3]);
                let sumDist = Math.round((distAC + distBC) * 1000000) / 1000000;
                //console.log("distAB " + distAB + " distAC " + distAC + " distBC " + distBC + " sum " + sumDist);

                if (distAB == sumDist)
                {
                    data.data[i].TrainData.SignalInFront = signal + "@-Infinity";
                    console.log(
                        "Train %c" + data.data[i].TrainNoLocal + "%c located by coordinates, it's assumed to be heading towards signal %c" + signal,
                        "color: #A0A0FF", "", "color: #A0A0FF"
                    );
                    break;
                }
            }
        }
    }
    let logTrainsWithNoSignal = "";
    for (let i in data.data) {
        if (data.data[i].TrainData.SignalInFront === null) {
            logTrainsWithNoSignal += data.data[i].TrainNoLocal + ", ";
        }
    }
    if (logTrainsWithNoSignal.length) {
        console.log("%cTrains not found: " + logTrainsWithNoSignal.slice(0, -2), "color: purple");
    }
    return data;
}

function recordTrains(data) {
    recorded = structuredClone(data);
}

function addClosedTracks(data) {

    closedTrackDummy = {
        TrainNoLocal : "00000",
        TrainData : {
            DistanceToSignalInFront : 1.0,
            SignalInFront : "",
            SignalInFrontSpeed : 0.0,
            Velocity : 0.0,
        }
    };

    for (let x of closedTrackSignals) {
        closedTrackDummy.TrainData.SignalInFront = x + "@0,0-0,0";
        data.data.push(structuredClone(closedTrackDummy));
    }
}

function drawCanvas(data) {

    ctx.font = "normal " + textSize + "px monospace";
    ctx.textBaseline = "top";

    ctx.fillStyle = coloursPalette[settings.colour][0];
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    ctx.fillStyle = coloursPalette[settings.colour][1];
    let text = layouts[area];
    for (let row in text) {
        for (let char in text[row].split("'")[0]) {
            ctx.fillText(text[row][char].replace("{", "─").replace("}", "─"), textSize * char / textSizeRatio * textMargin, textSize * row * textMargin);
        }
    }
    for (let row in menu) {
        for (let char in menu[row]) {
            ctx.fillText(menu[row][char], textSize * char / textSizeRatio * textMargin, textSize * (row * 1 + textLines - menu.length - 1) * textMargin);
        }
    }

    if (area == "Settings") {
        drawSettings();
    } else {
        let trainsToDraw = getTrainsCoords(data);
        drawTrains(trainsToDraw);
    }
    if (settings.drawScanLines) {
        drawScanLines();
    }
}

function getTrainBackground(signalSpeed = 999999, distanceToSignalInFront) {
    switch  (settings.showNextSignalSpeed) {
        case (distanceToSignalInFront == 0): // Next signal out of reach (we assume it's impossible to be exactly 0m away from a signal)
            return settings.colour; // Use current background style if speed can't be checked.
        case (signalSpeed > 250):
            return "grn";
        case (signalSpeed > 99):
            return "yel";
        case (signalSpeed > 39):
            return "org";
        default:
            return "red";
    }
}

function getTrainsCoords(data) {
    let trainsToDraw = [];
    let distancesFromTrainsToSignals = [];

    for (let train of data.data) {
        if (train.TrainData.SignalInFront != null) {
            let nextSignal = train.TrainData.SignalInFront.split("@")[0];
            if (Object.keys(coordinates[area]).includes(nextSignal)) {
                let trainBackgroundColour = getTrainBackground(train.TrainData.SignalInFrontSpeed, train.TrainData.DistanceToSignalInFront);

                trainsToDraw.push([
                    train.TrainNoLocal,
                    ...coordinates[area][nextSignal],
                    train.TrainData.Velocity,
                    signalDirections[area][nextSignal],
                    trainBackgroundColour,
                ]);
                distancesFromTrainsToSignals.push({
                    signalName: train.TrainData.SignalInFront.split("@")[0],
                    distance: train.TrainData.DistanceToSignalInFront
                });
            }
        }
    }

    // Remove second train in same section
    // Btw, if the second train in the same section appears first, it's not removed - but it doesn't matter, since the other train, closer to the end of the section, will be drawn on top of it.
    let distancesFromSIGNALStoTRAINS = {};
    for (let i in distancesFromSIGNALStoTRAINS) {
        if (distancesFromSIGNALStoTRAINS[distancesFromSignalsToTrains[i].signalName] == undefined) {
            distancesFromSIGNALStoTRAINS[distancesFromSignalsToTrains[i].signalName] = distancesFromSignalsToTrains[i].distance;
        } else if (distancesFromSIGNALStoTRAINS[distancesFromSignalsToTrains[i].signalName] < distancesFromSignalsToTrains[i].distance) {
            trainsToDraw[i] = [null];
        }
    }

    let logSignalsWithMultipleTrains = [];
    for (let i in trainsToDraw) {
        if (trainsToDraw[i][0] === null) {
            logSignalsWithMultipleTrains.push(distancesFromSignalsToTrains[i].signalName);
        }
    }
    if (logSignalsWithMultipleTrains.length) {
        console.log("Some sections have more than one train on them: ", logSignalsWithMultipleTrains);
    }

    return trainsToDraw;
}

function logSignalNames(data) {
    for (let train of data.data) {
        if (train.TrainData.SignalInFront != null) {
            if (loggedSignalNames[train.TrainNoLocal] == undefined) {
                loggedSignalNames[train.TrainNoLocal] = [];
            }
            let nextSignal = train.TrainData.SignalInFront.split("@")[0];
            if (loggedSignalNames[train.TrainNoLocal][loggedSignalNames[train.TrainNoLocal].length - 1] != nextSignal) {
                loggedSignalNames[train.TrainNoLocal].push(nextSignal);
            }
        }
    }
}

async function debugNextSignal(trainNo) {
    const data = await getDataFromServer();
    for (let train of data.data) {
        if (train.TrainNoLocal == trainNo) {
            console.log(train.TrainData.SignalInFront.split("@")[0])
            return train.TrainData.SignalInFront.split("@")[0];
        }
    }
    return null;
}

function drawSettings() {
    function writeCoolSettingName(settingName, isSelected) {
        if (settingName === true) {
            settingName = "YES ";
        } else if (settingName === false) {
            settingName = "NO  ";
        }
        settingName = settingName.toUpperCase();
        settingName = settingName.substring(0, 4);
        for (let i = 4; i > settingName.length; i--) {
            settingName = settingName += " ";
        }
        settingName = (isSelected ? "◄ " : "  ") + settingName + (isSelected ? " ►" : "  ");
        return settingName;
    }
    for (let id of Object.keys(settings)) {
        if (coordinates.Settings[id] != undefined) {
            drawNumberBox(writeCoolSettingName(settings[id], id == selectedSetting), ...coordinates.Settings[id], 0, 0, null, false, id == selectedSetting, 8);
        }
    }
}

function drawTrains(trainsToDraw) {
    if (trainsToDraw.length) {
        for (let train of trainsToDraw) {
            drawNumberBox(...train);

            if (settings.showTrainSpeed && train[0] != "00000")
                drawNumberBox(...createSpeedBoxFromTrain(train), true, true, 3);
        }
    }
}

function createSpeedBoxFromTrain(train)
{
    let speedBox = train;
    let x = train[1];
    let y = train[2];
    speedBox[1] = (train[4] === 1 ? (speedBox[1] = x + 4) : (x - 1));
    speedBox[2] = y - 1;

    return speedBox;
}

function drawNumberBox(number = null, x, y, speed = -1, signalDirection = 0, boxBackgroundColour = null, isSpeedBox = false, drawBoundingBox = true, maxLength = 6) {
    if (settings.showTrainSpeed && isSpeedBox) {
        number = speed.toFixed(0);
    }
    else boxBackgroundColour = settings.colour;

    let n = number + "";
    ctx.fillStyle = drawBoundingBox ? coloursPalette[boxBackgroundColour][1] : coloursPalette[boxBackgroundColour][0];
    ctx.fillRect(x * textSize / textSizeRatio * textMargin, y * textSize * textMargin, textSize / textSizeRatio * textMargin * maxLength, textSize * textMargin);
    ctx.fillStyle = drawBoundingBox ? coloursPalette[boxBackgroundColour][0] : coloursPalette[boxBackgroundColour][1];

    //Set the text right aligned
    for (let i = 1; i <= maxLength; i++) {
        if (n.length < i) {
            x++;
        }
    }

    //Draw number
    for (let i = 0; i < n.length; i++) {
        ctx.fillText(n[i], textSize * (x + 1 * i) / textSizeRatio * textMargin, textSize * y * textMargin);
    }
}

const vitalSymbols = ["/", "-", "\\", "|"];
var vitalSymbolId = 0;
function drawVitalSymbol(updateVitalSymbol) {
    drawNumberBox(vitalSymbols[vitalSymbolId % 4], 0, textLines - 2, null, 0, null, false, false, 1);
    if (updateVitalSymbol) {
        vitalSymbolId++;
    }
}

function drawScanLines() {
    const lineWidth = 2;
    ctx.strokeStyle = 'rgba(' + [0, 0, 0, 0.2] + ')';
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (let i = 0; i < screenHeight / lineWidth / 2; i++) {
        ctx.moveTo(0, i * lineWidth * 2);
        ctx.lineTo(screenWidth, i * lineWidth * 2);
    }
    ctx.stroke();
}

function resizeMonitor() {
    let cnv = document.getElementById("cnv");
    const clientScreenRatio = window.innerWidth / window.innerHeight;
    if (clientScreenRatio < screenRatio) { // Let's have black bars on top and bottom, for a cinematic look! ...on vertical screns, probably! Yaaaay!
        cnv.style.width = window.innerWidth + "px";
        cnv.style.height = window.innerWidth / screenRatio + "px";
    } else { // In this case, we'll have vertical black bars
        cnv.style.height = window.innerHeight + "px";
        cnv.style.width = window.innerHeight * screenRatio + "px";
    }
    cnv.style.left = (window.innerWidth - cnv.clientWidth) / 2 + "px"
}

function flipLayouts() {
    if (isCurrentlyFlipped == settings.flipped) {
        return;
    }
    isCurrentlyFlipped = settings.flipped;
    function replaceAt(text, index, replacement) {
        return text.substring(0, index) + replacement + text.substring(index + replacement.length);
    }
    for (let layoutId in layouts) {
        if (layoutId == "Settings") {
            continue;
        }
        layouts[layoutId] = layouts[layoutId].reverse();
        for (let i in layouts[layoutId]) {
            let signals = layouts[layoutId][i].split("'");
            let row = signals.shift();
            let flippedSignals = signals.reverse();
            let flippedRow = "";
            for (let i = row.length - 1; i >= 0; i--) {
                flippedRow += row[i];
            }
            flippedRow = flippedRow
                .replaceAll("{", "þ").replaceAll("}", "{").replaceAll("þ", "}")
                .replaceAll(">", "þ").replaceAll("<", ">").replaceAll("þ", "<")
                .replaceAll("├", "þ").replaceAll("┤", "├").replaceAll("þ", "┤")
                .replaceAll("┬", "þ").replaceAll("┴", "┬").replaceAll("þ", "┴")
                .replaceAll("┌", "þ").replaceAll("┘", "┌").replaceAll("þ", "┘")
                .replaceAll("└", "þ").replaceAll("┐", "└").replaceAll("þ", "┐")
                .replaceAll("▶", "þ").replaceAll(" ◀", "▶ ").replaceAll(" þ","◀ ");
            let regex = /^([a-zA-Z0-9\Ł\ł\_]+)$/;
            let currentlyOnAStringThatNeedsToBeReverseFlipped = false;
            let stringsThatNeedsToBeReverseFlippedStartsAtId = 0;
            let stringToBeReverseFlipped = "";
            for (let charId in flippedRow) {
                if (regex.test(flippedRow[charId]) && charId < flippedRow.length - 1) {
                    if (!currentlyOnAStringThatNeedsToBeReverseFlipped) {
                        currentlyOnAStringThatNeedsToBeReverseFlipped = true;
                        stringsThatNeedsToBeReverseFlippedStartsAtId = charId * 1;
                    }
                    stringToBeReverseFlipped += flippedRow[charId];
                } else if (currentlyOnAStringThatNeedsToBeReverseFlipped) {
                    currentlyOnAStringThatNeedsToBeReverseFlipped = false;
                    let flippedString = "";
                    for (let i = stringToBeReverseFlipped.length - 1; i >= 0; i--) {
                        flippedString += stringToBeReverseFlipped[i];
                    }
                    //console.log(stringToBeReverseFlipped, flippedString);
                    flippedRow = replaceAt(flippedRow, stringsThatNeedsToBeReverseFlippedStartsAtId, flippedString);
                    stringToBeReverseFlipped = "";
                }
            }
            for (let signal of flippedSignals) {
                flippedRow += "'" + signal;
            }
            layouts[layoutId][i] = flippedRow;
        }
    }
    initCoords();
    updateTrainDescriber();
}

document.addEventListener("DOMContentLoaded", resizeMonitor);
window.onresize = resizeMonitor;

function changeSetting(x) {
    if (area != "Settings") {
        return;
    }
    let index = availableSettings[selectedSetting].indexOf(settings[selectedSetting]);
    index += x;
    //console.log(availableSettings[selectedSetting], settings[selectedSetting]);
    if (index == availableSettings[selectedSetting].length) {
        index = 0;
    } else if (index < 0) {
        index = availableSettings[selectedSetting].length - 1;
    }
    //console.log(index);
    settings[selectedSetting] = availableSettings[selectedSetting][index];
    let href = "";
    for (let id in availableSettings) {
        if (id == "server") {
            href += "_" + settings[id];
        } else {
            href += "_" + availableSettings[id].indexOf(settings[id]);
        }
    }
    window.location.href = "#" + href.slice(1);
    updateTrainDescriber();
}

function changeSelectedSetting(x) {
    if (area != "Settings") {
        return;
    }
    let index = Object.keys(availableSettings).indexOf(selectedSetting);
    index += x;
    if (index == Object.keys(availableSettings).length) {
        index = 0;
    } else if (index < 0) {
        index = Object.keys(availableSettings).length - 1;
    }
    selectedSetting = Object.keys(availableSettings)[index];
    updateTrainDescriber();
}

function keyboard(e) {
    //console.log("Key detected: " + e.key);
    let setAreaTo = area;
    switch (e.key.toLowerCase()) {
        case "1":
            setAreaTo = "L001_KO_Zw";
            break;
        case "2":
            setAreaTo = "L004_Zw_Gr";
            break;
        case "3":
            setAreaTo = 'L001_Zy_WSD';
            break;
        case "4":
            setAreaTo = 'L171_L131';
            break;
        case "5":
            setAreaTo = "L062_SG_Tl";
            break;   
        case "6":
            setAreaTo = "L008_KG_Kz";
            break;
        case "e":
            setAreaTo = "Settings";
            break;
        case "arrowleft":
        case "a":
            changeSetting(-1);
            break;
        case "arrowright":
        case "d":
            changeSetting(1);
            break;
        case "arrowup":
        case "w":
            changeSelectedSetting(-1);
            break;
        case "arrowdown":
        case "s":
            changeSelectedSetting(1);
            break;
    }
    if (area != setAreaTo) {
        updateTrainDescriber();
        area = setAreaTo;
    }
}

document.addEventListener("keydown", keyboard);
