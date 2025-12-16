/* Configuration */
let MQTT_HOST = "";
let MQTT_PORT = 9001;
let MQTT_CLIENT_ID = "web_dashboard_" + Math.floor(Math.random() * 10000);
let MQTT_USER = "";
let MQTT_PASS = "";
let MQTT_SSL = false;
let MQTT_PATH = "/ws";

const TOPIC_DHT = "smart-iot/monitoring/dht22";
const TOPIC_CONFIG = "smart-iot/monitoring/config";

/* DOM Elements */
const elStatus = document.getElementById("connection-status");
const elTemp = document.getElementById("val-temp");
const elHum = document.getElementById("val-hum");
const elRelay = document.getElementById("val-relay");
const elRelayIcon = document.getElementById("relay-icon");
const elRelayBg = document.getElementById("relay-icon-bg");
const elRelayDot = document.getElementById("relay-dot");
const elRelayText = document.getElementById("relay-text");
const elHumBar = document.getElementById("hum-bar");
const elLastUpdate = document.getElementById("last-update");
const elToast = document.getElementById("toast");

const inputTempOn = document.getElementById("input-temp-on");
const inputTempOff = document.getElementById("input-temp-off");
const formConfig = document.getElementById("config-form");

/* MQTT Modal Elements */
const elMqttModal = document.getElementById("mqtt-modal");
const formMqtt = document.getElementById("mqtt-form");
const inputMqttHost = document.getElementById("mqtt-host");
const inputMqttPort = document.getElementById("mqtt-port");
const inputMqttPath = document.getElementById("mqtt-path");
const inputMqttUser = document.getElementById("mqtt-user");
const inputMqttPass = document.getElementById("mqtt-pass");
const inputMqttSsl = document.getElementById("mqtt-ssl");
const ipnutMqttSave = document.getElementById("mqtt-save");

/* Chart Setup */
let chart;
const MAX_DATA_POINTS = 20;

function initChart() {
    const ctx = document.getElementById('liveChart').getContext('2d');
    
    // Gradient for Temp
    let gradientTemp = ctx.createLinearGradient(0, 0, 0, 400);
    gradientTemp.addColorStop(0, 'rgba(251, 146, 60, 0.5)'); // Orange
    gradientTemp.addColorStop(1, 'rgba(251, 146, 60, 0)');

    // Gradient for Hum
    let gradientHum = ctx.createLinearGradient(0, 0, 0, 400);
    gradientHum.addColorStop(0, 'rgba(96, 165, 250, 0.5)'); // Blue
    gradientHum.addColorStop(1, 'rgba(96, 165, 250, 0)');

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Temperature (°C)',
                    borderColor: '#fb923c', // Orange-400
                    backgroundColor: gradientTemp,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#fff',
                    fill: true,
                    tension: 0.4,
                    data: []
                },
                {
                    label: 'Humidity (%)',
                    borderColor: '#60a5fa', // Blue-400
                    backgroundColor: gradientHum,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#fff',
                    fill: true,
                    tension: 0.4,
                    data: []
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#e2e8f0',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 5 }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' },
                    beginAtZero: false
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

function updateChart(timestamp, temp, hum) {
    const timeLabel = timestamp.split(' ')[1]; // Extract HH:MM:SS
    
    chart.data.labels.push(timeLabel);
    chart.data.datasets[0].data.push(temp);
    chart.data.datasets[1].data.push(hum);

    if (chart.data.labels.length > MAX_DATA_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
    }
    chart.update();
}

/* MQTT Setup */
let client = null;

/* LocalStorage Logic */
function checkStoredConfig() {
    const storedConfig = localStorage.getItem('mqtt_config');
    if (storedConfig) {
        try {
            const config = JSON.parse(storedConfig);
            if (config.host) inputMqttHost.value = config.host;
            if (config.port) inputMqttPort.value = config.port;
            if (config.path) inputMqttPath.value = config.path;
            if (config.user) inputMqttUser.value = config.user;
            if (config.pass) inputMqttPass.value = config.pass;
            if (config.ssl) inputMqttSsl.checked = config.ssl;
            ipnutMqttSave.checked = true;
            
            // Optional: Auto-connect if configured
            // performConnection(config.host, config.port, config.user, config.pass);
        } catch (e) {
            console.error("Error parsing stored config", e);
        }
    }
}

/* Connection Funcs */
formMqtt.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const host = inputMqttHost.value.trim();
    const port = Number(inputMqttPort.value);
    const path = inputMqttPath.value.trim() || "/ws";
    const user = inputMqttUser.value.trim();
    const pass = inputMqttPass.value.trim();
    const ssl = inputMqttSsl.checked;
    const save = ipnutMqttSave.checked;

    if (!host || !port) {
        alert("Host and Port are required!");
        return;
    }

    if (save) {
        const config = { host, port, path, user, pass, ssl };
        localStorage.setItem('mqtt_config', JSON.stringify(config));
    } else {
        localStorage.removeItem('mqtt_config');
    }

    performConnection(host, port, path, user, pass, ssl);
});

function performConnection(host, port, path, user, pass, ssl) {
    // Update Globals
    MQTT_HOST = host;
    MQTT_PORT = port;
    MQTT_PATH = path;
    MQTT_USER = user;
    MQTT_PASS = pass;
    MQTT_SSL = ssl;

    // Dispose old client if exists
    if (client) {
        try { client.disconnect(); } catch (e) {}
        client = null;
    }

    // Create new client
    // Note: Paho Client ID must be unique
    MQTT_CLIENT_ID = "web_dashboard_" + Math.floor(Math.random() * 10000);
    client = new Paho.MQTT.Client(MQTT_HOST, Number(MQTT_PORT), MQTT_PATH, MQTT_CLIENT_ID);

    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;

    connectMQTT();
}

function connectMQTT() {
    updateStatus("Connecting...", "neutral");
    
    const options = {
        onSuccess: onConnect,
        onFailure: onFailure,
        useSSL: MQTT_SSL, 
        keepAliveInterval: 30
    };

    if (MQTT_USER) options.userName = MQTT_USER;
    if (MQTT_PASS) options.password = MQTT_PASS;

    try {
        client.connect(options);
    } catch (e) {
        onFailure({ errorMessage: e.message });
    }
}

function onConnect() {
    console.log("MQTT Connected");
    updateStatus("Connected", "online");
    
    // Hide Modal on success
    elMqttModal.classList.add('opacity-0', 'pointer-events-none');
    
    client.subscribe(TOPIC_DHT);
    client.subscribe(TOPIC_CONFIG);
}

function onFailure(responseObject) {
    console.log("MQTT Connection Failed: " + responseObject.errorMessage);
    updateStatus("Failed", "offline");
    
    // Show Modal if failed (encourage retry)
    elMqttModal.classList.remove('opacity-0', 'pointer-events-none');
    
    // Do not auto-retry indefinitely without user action if credentials are bad
    alert("Connection Failed: " + responseObject.errorMessage);
}

function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log("Connection Lost: " + responseObject.errorMessage);
    }
    updateStatus("Disconnected", "offline");
    
    // If lost, maybe show modal? or retry silently?
    setTimeout(connectMQTT, 5000);
}

function onMessageArrived(message) {
    const topic = message.destinationName;
    const payload = message.payloadString;
    console.log("Msg Arrived [" + topic + "]: " + payload);

    try {
        const data = JSON.parse(payload);
        
        if (topic === TOPIC_DHT) {
            updateDashboard(data);
        } else if (topic === TOPIC_CONFIG) {
            updateConfigInputs(data);
        }
    } catch (e) {
        console.error("JSON Parse Error", e);
    }
}

function updateConfigInputs(data) {
    if (data.temp_on !== undefined) {
        inputTempOn.value = data.temp_on;
    }
    if (data.temp_off !== undefined) {
        inputTempOff.value = data.temp_off;
    }
}

/* UI Updates */
function updateStatus(text, type) {
    const dot = elStatus.querySelector('.status-dot');
    const txt = elStatus.querySelector('.status-text');
    
    txt.textContent = text;
    
    // Reset classes
    dot.classList.remove('online', 'offline');
    elStatus.classList.remove('border-emerald-500/20', 'border-red-500/20', 'bg-emerald-500/10', 'bg-red-500/10');
    
    if (type === 'online') {
        dot.classList.add('online');
        elStatus.classList.add('border-emerald-500/20', 'bg-emerald-500/10', 'text-emerald-400');
    } else if (type === 'offline') {
        dot.classList.add('offline');
        elStatus.classList.add('border-red-500/20', 'bg-red-500/10', 'text-red-400');
    } else {
        elStatus.classList.add('text-slate-400');
    }
}

function updateDashboard(data) {
    // Expects: { "timestamp":..., "temperature":..., "humidity":..., "relay":"ON"/"OFF" }
    
    // 1. Temperature
    elTemp.textContent = parseFloat(data.temperature).toFixed(1);
    
    // 2. Humidity
    elHum.textContent = parseFloat(data.humidity).toFixed(1);
    elHumBar.style.width = `${Math.min(data.humidity, 100)}%`;
    
    // 3. Relay
    const isRelayOn = data.relay === "ON";
    elRelay.textContent = isRelayOn ? "ON" : "OFF";
    elRelayText.textContent = isRelayOn ? "Cooling Active" : "System Idle";
    
    if (isRelayOn) {
        elRelayIcon.classList.add('spin-fast', 'text-white');
        elRelayIcon.classList.remove('text-slate-400');
        
        elRelayBg.classList.remove('bg-slate-700/50', 'border-white/10');
        elRelayBg.classList.add('bg-emerald-500', 'border-emerald-400', 'shadow-lg', 'shadow-emerald-500/30');

        elRelayDot.classList.add('bg-emerald-400', 'shadow-[0_0_10px_#34d399]');
        elRelayDot.classList.remove('bg-slate-500', 'shadow-none');
    } else {
        elRelayIcon.classList.remove('spin-fast', 'text-white');
        elRelayIcon.classList.add('text-slate-400');
        
        elRelayBg.classList.add('bg-slate-700/50', 'border-white/10');
        elRelayBg.classList.remove('bg-emerald-500', 'border-emerald-400', 'shadow-lg', 'shadow-emerald-500/30');

        elRelayDot.classList.remove('bg-emerald-400', 'shadow-[0_0_10px_#34d399]');
        elRelayDot.classList.add('bg-slate-500', 'shadow-none');
    }

    // 4. Timestamp
    elLastUpdate.textContent = data.timestamp.split(' ')[1]; // HH:MM:SS

    // 5. Chart
    updateChart(data.timestamp, data.temperature, data.humidity);
}

/* Config Publish */
formConfig.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const tOn = parseFloat(inputTempOn.value);
    const tOff = parseFloat(inputTempOff.value);

    if (isNaN(tOn) || isNaN(tOff)) {
        alert("Please enter valid numbers");
        return;
    }

    const payload = JSON.stringify({
        "temp_on": tOn,
        "temp_off": tOff
    });

    const message = new Paho.MQTT.Message(payload);
    message.destinationName = TOPIC_CONFIG;
    message.retained = true;
    
    try {
        client.send(message);
        showToast();
        console.log("Config Sent: " + payload);
    } catch (e) {
        console.error("Failed to send config", e);
        alert("Not connected to MQTT!");
    }
});

function showToast() {
    elToast.classList.remove('opacity-0');
    elToast.classList.add('opacity-100', 'translate-y-0');
    setTimeout(() => {
        elToast.classList.remove('opacity-100', 'translate-y-0');
        elToast.classList.add('opacity-0');
    }, 3000);
}

/* Init */
window.addEventListener('DOMContentLoaded', () => {
    initChart();
    checkStoredConfig();
});
