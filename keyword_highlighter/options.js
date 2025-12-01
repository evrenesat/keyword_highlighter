const defaultSettings = {
    defaultEnabled: true,
    siteList: [],
    minWordsInBlock: 10,
    bolderDarkenBg: 'rgba(0, 0, 0, 0.1)',
    bolderLightenBg: 'rgba(255, 255, 255, 0.25)'
};

function saveOptions() {
    const defaultEnabled = document.getElementById('defaultEnabled').checked;
    const siteListRaw = document.getElementById('siteList').value;
    const siteList = siteListRaw.split('\n').map(s => s.trim()).filter(s => s);
    const minWordsInBlock = parseInt(document.getElementById('minWordsInBlock').value, 10);
    const bolderDarkenBg = document.getElementById('bolderDarkenBg').value;
    const bolderLightenBg = document.getElementById('bolderLightenBg').value;

    browser.storage.local.set({
        defaultEnabled,
        siteList,
        minWordsInBlock,
        bolderDarkenBg,
        bolderLightenBg
    }).then(() => {
        const status = document.getElementById('status');
        status.textContent = 'Options saved.';
        setTimeout(() => {
            status.textContent = '';
        }, 1500);
    });
}

function restoreOptions() {
    browser.storage.local.get(defaultSettings).then((result) => {
        document.getElementById('defaultEnabled').checked = result.defaultEnabled;
        document.getElementById('siteList').value = result.siteList.join('\n');
        document.getElementById('minWordsInBlock').value = result.minWordsInBlock;
        document.getElementById('bolderDarkenBg').value = result.bolderDarkenBg;
        document.getElementById('bolderLightenBg').value = result.bolderLightenBg;
    });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('defaultEnabled').addEventListener('change', saveOptions);
document.getElementById('siteList').addEventListener('input', saveOptions);
document.getElementById('minWordsInBlock').addEventListener('input', saveOptions);
document.getElementById('bolderDarkenBg').addEventListener('input', saveOptions);
document.getElementById('bolderLightenBg').addEventListener('input', saveOptions);
