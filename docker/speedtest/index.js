const execa = require("execa");
const Influx = require("influx");
const delay = require("delay");

const bitToMbps = bit => (bit / 1000 / 1000) * 8;

const log = (message, severity = "Info") =>
  console.log(`[${severity.toUpperCase()}][${new Date()}] ${message}`);
  
const serversList = {
	17947: "mts Belgrade", // speedtest.mts.rs - 212.200.230.229 - wan1
	4792: "Vip mobile", // speedtest.vipmobile.rs - 77.243.16.48 - wan2
	20191: "mts Nis" // speedtest2.mts.rs - 212.200.230.251 - wan3
};

const getSpeedMetrics = async (serverId) => {
  const { stdout } = await execa("speedtest", [
    "--accept-license",
    "--accept-gdpr",
    "-s",
    serverId,
    "-f",
    "json"
  ]);
  const result = JSON.parse(stdout);
  return {
    upload: bitToMbps(result.upload.bandwidth),
    download: bitToMbps(result.download.bandwidth),
    ping: result.ping.latency
  };
};

const pushToInflux = async (serverId, influx, metrics) => {
  const points = Object.entries(metrics).map(([measurement, value]) => ({
    measurement,
    tags: { host: serversList[serverId] },
    fields: { value }
  }));

  await influx.writePoints(points);
};

(async () => {
  try {
    const influx = new Influx.InfluxDB({
      host: process.env.INFLUXDB_HOST,
      database: process.env.INFLUXDB_DB
    });

    while (true) {
	  Object.keys(serversList).forEach(function (serverId) { 
        log(`Starting speedtest for server ${serverId}...`);
        const speedMetrics = await getSpeedMetrics(serverId);
        log(
	       `Speedtest results from server ${serverId} - Download: ${speedMetrics.download}, Upload: ${speedMetrics.upload}, Ping: ${speedMetrics.ping}`
        );
        await pushToInflux(serverId, influx, speedMetrics);
		await delay(1000)
      }

      log(`Sleeping for ${process.env.SPEEDTEST_INTERVAL} seconds...`);
      await delay(process.env.SPEEDTEST_INTERVAL * 1000);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
