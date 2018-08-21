#!/usr/bin/env node#!/usr/bin/env

// Dependencies
const fs = require('fs-extra');
const path = require('path');
const argv = require('yargs').argv;
const request = require('cached-request')(require('request'));
const cheerio = require('cheerio');
const csv = require('d3-dsv').dsvFormat(',');
const moment = require('moment-timezone');
require('dotenv').load();

// Request cache
const cacheDir = path.join(__dirname, '..', '.cache');
fs.mkdirpSync(cacheDir);
request.setCacheDirectory(cacheDir);
const TTL = argv.cache === false ? 0 : 60 * 60 * 1000;
const TIMEOUT = 10 * 60 * 1000;

// Check for config
if (!process.env.SCRAPER_CALENDAR_URL) {
  throw new Error(
    'Make sure the SCRAPER_CALENDAR_URL environment variable is set.'
  );
}

// Date
let calendarDate = argv.date
  ? moment(argv.date, ['MM/DD/YYYY', 'YYYY-MM-DD'])
  : moment();

// Output
let outputDir = argv.output || path.join(__dirname, '..', 'output');
outputDir = path.join(outputDir, 'calendar');
fs.mkdirpSync(outputDir);
let outputPath = path.join(
  outputDir,
  `${calendarDate.format('YYYY-MM-DD')}.csv`
);

// Make request
request(
  {
    ttl: TTL,
    method: 'POST',
    timeout: TIMEOUT,
    url: process.env.SCRAPER_CALENDAR_URL,
    headers: {
      'Cache-Control': 'no-cache'
    },
    form: {
      court: 'D',
      countyC: '',
      countyD: argv.county || process.env.SCRAPER_CALENDAR_COUNTY,
      selectRadio: 'date',
      searchField: calendarDate.format('MM/DD/YYYY'),
      submitButton: 'Submit'
    }
  },
  (error, response, body) => {
    if (error) {
      console.error(error);
      throw new Error('Error requesting Calendar URL.');
    }
    if (response.statusCode >= 300) {
      throw new Error(
        `Status response of Calendar URL: ${response.statusCode}`
      );
    }

    // Data
    let data = [];

    // Cheerio
    const $ = cheerio.load(body.toString());

    // Main tables
    $('table.table-condensed').each((i, el) => {
      let $table = $(el);

      // Get heading
      let heading = $table
        .find('thead th[colspan=6]')
        .text()
        .trim();

      // Go through rows
      $table.find('tbody tr').each((i, el) => {
        let $tds = $(el).find('td');
        if (
          !$($tds[5])
            .text()
            .trim()
        ) {
          return;
        }

        data.push({
          ctrm: heading,
          name: $($tds[0])
            .text()
            .trim(),
          date: $($tds[1])
            .text()
            .trim(),
          time: $($tds[2])
            .text()
            .trim(),
          hearing: $($tds[3])
            .text()
            .trim(),
          caption: $($tds[4])
            .text()
            .trim(),
          case: $($tds[5])
            .text()
            .trim()
        });
      });
    });

    fs.writeFileSync(outputPath, csv.format(data));
    console.error(`Done. Saved to: ${outputPath}`);
  }
);
