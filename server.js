const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mediasoup = require('mediasoup');

const app = express();
const server = http.createServer(app);
const io = new Server(server);


app.use(express.static(__dirname));

const mediasoupConfig = {
  // Configuración para mediasoup Worker
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
let producer;

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

  socket.on('createProducer', async ({ transportOptions, kind, rtpParameters }, callback) => {
    const transport = await router.createWebRtcTransport(transportOptions);
    producer = await transport.produce({ kind, rtpParameters });
    callback({ id: producer.id });
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });
});

server.listen(3000, async () => {
  await createMediasoupWorker();
  console.log('Servidor escuchando en http://localhost:3000');
});

