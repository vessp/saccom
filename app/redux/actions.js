const electron = window.require('electron')
const {ipcRenderer, shell, app} = electron
const {dialog} = electron.remote
const fs = window.require('fs')
const axios = window.require('axios')
const settings = window.require('electron-settings')
import {trace, notify} from '../util/Tracer'
const {exec} = window.require('child_process')
import IO from '../util/IO'

const config = ipcRenderer.sendSync('config')

let webSocket = null
let _dispatch = null

function toReducer(type, payload) {
    _dispatch({type, payload})
}
function toMain(type, payload) {
    ipcRenderer.send(type, payload)
}

export function playGlobal(name) {
    return (dispatch, getState) => {
        webSocket.send(JSON.stringify({
            type: 'play',
            payload: name
        }))
    }
}

export function playLocal(name) {
    return (dispatch, getState) => {
        const clipPath = getState().app.get('userDataDir') + '\\playlist\\' + name
        trace('playLocal: ' + clipPath)
        dispatch({ type: 'activeBlurb', payload: clipPath})
    }
}

export function removeAudio(name) {
    return (dispatch, getState) => {
        webSocket.send(JSON.stringify({
            type: 'remove',
            payload: name
        }))
    }
}

export function activeBlurb(name) {
    return (dispatch, getState) => {
        dispatch({
            type: 'activeBlurb',
            payload: name
        })
    }
}

export function windowMode(mode) {
    return (dispatch, getState) => {
        toReducer('windowMode', mode)
    }
}

export function overlayKey(keyString) {
    return (dispatch, getState) => {
        toReducer('overlayKey', keyString)
    }
}

export function onUpload(keyCode) {
    return (dispatch, getState) => {
        doUpload(getState)
    }
}

export function setClipKey(clipName, keyString) {
    return (dispatch, getState) => {
        toReducer('setClipKey', {clipName, keyString})
    }
}

export function hotkeyWindowTitle(title) {
    return (dispatch, getState) => {
        toReducer('hotkeyWindowTitle', title)
    }
}

export function hitchName(name) {
    return (dispatch, getState) => {
        toReducer('hitchName', name)
    }
}

export function openPlaylistFolder(path) {
    return (dispatch, getState) => {
        const playlistDir = getState().app.get('userDataDir') + '\\playlist'
        exec('start ' + playlistDir)
    }
}

export function init() {
    return (dispatch, getState) => {
        _dispatch = dispatch

        toReducer('windowMode', 1)

        settings.get('overlayKey').then(val => {
            toReducer('overlayKey', val)
        })

        settings.get('keyMap').then(val => {
            toReducer('keyMap', val)
        })

        settings.get('hotkeyWindowTitle').then(val => {
            toReducer('hotkeyWindowTitle', val)
        })

        settings.get('hitchName').then(val => {
            toReducer('hitchName', val)
        })

        ipcRenderer.on('windowMode', (event, mode) => {
            toReducer('windowMode', mode)
        })
        ipcRenderer.on('doUpload', () => {
            doUpload(getState)
        })
        ipcRenderer.on('setHotkeyError', error => {
            alert('Setting that hotkey failed, please try a different key. ' + JSON.stringify(error), 'Kindred')
            toReducer('overlayKey', null)
        })
        ipcRenderer.on('onOverlayKey', () => {
            const windowMode = getState().app.get('windowMode')
            toReducer('windowMode', windowMode != 2 ? 2 : 0)
        })
        ipcRenderer.on('onTrayClick', () => {
            const windowMode = getState().app.get('windowMode')
            toReducer('windowMode', windowMode != 1 ? 1 : 0)
        })

        startProcessChecking(dispatch, getState)
        // dispatch(doSocketConnect())
        downloadCrisp(dispatch, getState)

        // migrateCrisp(dispatch, getState)
        // notify(config.ROOT_FOLDER)
    }
}

export function doSocketConnect() {
    return (dispatch, getState) => {
        webSocket = new WebSocket(config.URL_WEB_SOCKET)
        webSocket.onopen = (event) => {
            toReducer('isSocketConnected', true)
            startPings(dispatch, getState)
        }
        webSocket.onclose = (event) => {
            toReducer('isSocketConnected', false)
        }
        webSocket.onmessage = (event) => {
            if(event.data) {
                const data = JSON.parse(event.data)
                // trace('onMessage:', data.type, data.message)
                if(data.type == 'playlist') {
                    dispatch({type: 'playlist', payload: data.message})
                }
                else if(data.type == 'play') {
                    dispatch(playLocal(data.message))
                }
                else if(data.type == 'userCount') {
                    dispatch({type: 'userCount', payload: data.message})
                }
            }
            toReducer('lastMessageInstant', Date.now())
        }
        webSocket.onerror = (event) => {
            alert('Socket Error: ' + JSON.stringify(event))
        }
    }
}

export function doSocketDisconnect() {
    return (dispatch, getState) => {
        webSocket.close()
        webSocket = null
    }
}

export function downloadCrisp(dispatch, getState) {
    //TODO first check latest version on server and compare to me

    // if new version available download file
    toReducer('isCrisp', false)

    const remoteFileUrl = config.URL_SERVER_ROOT + '/dist/Kindred-win32-x64.zip'
    IO.downloadFile(remoteFileUrl, config.PATH_CRISP_ZIP, () => {
        trace('finished downloading crisp')
        toReducer('crispStatus', {
            message: 'Extracting..'
        })

        
        //because i have a real folder directly inside the zip file, 
        //we can unzip into crisp, that innser folder will be put into crisp
        const exePath = config.PATH_TOOLS + '\\unzip.exe'
        const zipPath = config.PATH_CRISP_ZIP
        const extractToPath = config.PATH_CRISP
        const cmd = exePath + ' "' + zipPath + '" "' + extractToPath + '"'

        exec(cmd, (error, stdout, stderr) => {
            let message
            if(error) {
                trace('error:', error)
                message = 'error: ' + error
            }
            else if(stderr) {
                trace('stderr:', stderr)
                message = 'stderr: ' + stderr
            }
            else {
                if(stdout) trace('stdout', stdout)
                message = 'Extracting Complete'
            }
            
            toReducer('crispStatus', { message: message })

            setTimeout(() => {
                toReducer('crispStatus', { message: 'Kindred will restart..' })

                setTimeout(() => {
                    migrateCrisp(dispatch, getState)
                }, 2000)
            }, 2000)
        })
    },
    (progress) => {
        toReducer('crispStatus', progress)
    })
}

export function migrateCrisp(dispatch, getState) {

    //download file to userdata, unzip it
    //quit, running batch from unzipped folder
    //batch deletes old folder (passed in path?) and moves folder from userdata
    //run newly copied exe

    const bat = config.PATH_TOOLS + '\\migrate.bat'
    const fromPath = config.PATH_CRISP_UNZIPPED
    const toPath = config.PATH_ROOT_FOLDER
    const cmd = bat + ' "' + fromPath + '" "' + toPath + '"'

    notify('cmd', cmd)

    // exec(cmd, (error, stdout, stderr) => {
    //     if(error) notify('error:', error)
    //     if(stderr) notify('stderr:', stderr)
    //     notify('stdout', stdout)
    // })
    // toMain('quit')
}

let pingTimer = null
function startPings(dispatch, getState) {
    if(pingTimer != null)
        return

    const messagesElapsed = Date.now() - getState().app.get('lastMessageInstant')
    const actionsElapsed = Date.now() - getState().app.get('lastActionInstant')
    const hitchActive = getState().app.get('hitchActive')
    if(messagesElapsed >= 39000) {
        if(actionsElapsed < 5*60*1000 || hitchActive) {
            // trace('do ping')
            webSocket.send(JSON.stringify({
                type: 'ping',
                payload: ''
            }))
            toReducer('lastMessageInstant', Date.now())

            pingTimer = setTimeout(() => {
                pingTimer = null
                startPings(dispatch, getState)
            }, 5000)
        }
        else {
            dispatch(doSocketDisconnect())
        }
    }
    else {
        pingTimer = setTimeout(() => {
            pingTimer = null
            startPings(dispatch, getState)
        }, 5000)
    }
}

function doUpload(getState) {
    let chosenFiles = dialog.showOpenDialog({properties: ['openFile']}) //'openDirectory', 'multiSelections'
    if(chosenFiles) {
        const chosenFilePath = chosenFiles[0]
        const parts = chosenFilePath.split('\\')
        const chosenFileName = parts[parts.length-1]
        // trace('uploading..', chosenFilePath)

        if(getState().app.get('playlist').indexOf(chosenFileName) != -1)
        {
            alert('That name is already taken.  Please choose a different one.', 'Kindred')
            trace('name already taken')
            return
        }

        // trace('opening..', chosenFilePath)
        fs.open(chosenFilePath, 'r', (err, fd) => {
            if (err) { trace(err); return }
            // trace('file opened..', chosenFilePath)
            fs.readFile(fd, (err, fileBytes) => {
                if (err) { trace(err); return }
                trace('posting..', chosenFilePath)
                axios.post(config.URL_AUDIO_ROOT, {name: chosenFileName, data: fileBytes})
                    .then(function (response) {
                        trace('response', response)
                    })
                    .catch(function (err) {
                        trace('err', err)
                    })
            })
        })
    }
}

let processCheckingTimer = null
function startProcessChecking(dispatch, getState) {
    if(processCheckingTimer == null) {
        checkProcesses()
        return
    }

    function ref() {
        processCheckingTimer = setTimeout(() => {
            processCheckingTimer = null
            startProcessChecking(dispatch, getState)
        }, 60*1000)
    }

    function checkProcesses() {
        const hitchName = getState().app.get('hitchName')
        if(hitchName == null || hitchName == '') {
            // trace('no hitch')
            onHitchPass()
        }
        else {
            exec('tasklist /fo csv /fi "Imagename eq ' + hitchName + '"', (error, stdout, stderr) => {
                if(error) trace('tasklist error:', error)
                if(stderr) trace('tasklist stderr:', stderr)
                const lines = stdout.replace(/[\"\r]/g, '').split('\n').filter(line => line.length > 0)
                if(lines.length > 1) { //if we found a matching process
                    const processName = lines[1].split(',')[0]
                    // trace('process found', processName)
                    onHitchPass()
                }
                else {
                    // trace('no process found')
                    toReducer('hitchActive', false)
                }
            })
        }
        ref()
    }

    function onHitchPass() {
        toReducer('hitchActive', true)
        const isSocketConnected = getState().app.get('isSocketConnected')
        if(!isSocketConnected)
            dispatch(doSocketConnect())
    }
}