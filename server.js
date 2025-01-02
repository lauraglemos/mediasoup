const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mediasoup = require('mediasoup');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const mediasoupConfig = {
  worker: {
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
  },
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
    ],
  },
};

let worker;
let router;
let transports = {};
let producers = {};

async function createMediasoupWorker() {
  worker = await mediasoup.createWorker(mediasoupConfig.worker);

  worker.on('died', () => {
    console.error('Mediasoup Worker murió, reinicia el servidor');
    process.exit(1);
  });

  console.log('Mediasoup Worker creado');
  router = await worker.createRouter({ mediaCodecs: mediasoupConfig.router.mediaCodecs });
}

io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado');

  socket.on('getRouterRtpCapabilities', (_, callback) => {
    callback(router.rtpCapabilities);
  });

  socket.on('createProducer', async ({ kind, rtpParameters }, callback) => {
    try {
      if (!rtpParameters || !rtpParameters.codecs || rtpParameters.codecs.length === 0) {
        throw new Error('Parámetros RTP inválidos: faltan codecs.');
      }
  
      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: 'your_public_ip' }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });
  
      const producer = await transport.produce({ kind, rtpParameters });
  
      console.log(`Productor ${kind} creado con ID: ${producer.id}`);
      callback({ id: producer.id });
    } catch (err) {
      console.error('Error al crear productor:', err);
      callback({ error: err.message });
    }
  });
  
  
  

  socket.on('createConsumer', async ({ producerId }, callback) => {
    try {
      if (!producerId) {
        throw new Error('Producer ID no válido.');
      }
  
      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: 'your_public_ip' }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });
  
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities: router.rtpCapabilities,
        paused: false,
      });
  
      console.log(`Consumidor creado: ${consumer.id}, tipo: ${consumer.kind}`);
  
      callback({
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (err) {
      console.error('Error al crear consumidor:', err);
      callback({ error: err.message });
    }
  });
  
  
  

  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
    if (transports[socket.id]) {
      transports[socket.id].close();
      delete transports[socket.id];
    }
    if (producers[socket.id]) {
      Object.values(producers[socket.id]).forEach((producer) => producer.close());
      delete producers[socket.id];
    }
  });
  



});

server.listen(3000, async () => {
  await createMediasoupWorker();
  console.log('Servidor escuchando en http://localhost:3000');
});
