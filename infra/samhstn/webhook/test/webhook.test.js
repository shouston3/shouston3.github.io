'use strict';

const test = require('tape');

const {handler} = require('../webhook.js');
const {AWS, AWS_REGION, API_VERSION} = require('../config.js');
const sampleEvent = require('./sampleEvent.js');
const rawEvent = require('./rawEvent.js');

const genEvent = (secret) => (event) => {
  const crypto = require('crypto');
  const bodyEncoded = encodeURIComponent(`payload=${JSON.stringify(event.body)}`);

  const body = Buffer.from(bodyEncoded, 'utf-8').toString('base64')

  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(bodyEncoded, 'utf-8');
  const sha1 = hmac.digest('hex');

  const headers = Object.assign(event.headers, {'x-hub-signature': `sha1=${sha1}`});

  return Object.assign(event, {body, headers});
}

test('ping event with correct secret string', async (t) => {
  t.plan(2);

  const secretsManager = new AWS.SecretsManager({region: AWS_REGION, apiVersion: API_VERSION});
  const secretValueReq = secretsManager.getSecretValue({SecretId: '/GithubSecret'});
  const { SecretString } = await secretValueReq.promise();

  const events = [sampleEvent.ping, rawEvent.ping].map(genEvent(SecretString));

  await Promise.all(events.map(async (e) => {
    const response = await handler(e);
    const expected = {
      statusCode: 200,
      body: 'OK'
    };

    t.deepEqual(response, expected);
  }));

  t.end();
})

test('push event with correct secret string', async (t) => {
  t.plan(2);

  const secretsManager = new AWS.SecretsManager({region: AWS_REGION, apiVersion: API_VERSION});
  const secretValueReq = secretsManager.getSecretValue({SecretId: '/GithubSecret'});
  const { SecretString } = await secretValueReq.promise();

  const events = [sampleEvent.push, rawEvent.push].map(genEvent(SecretString));

  await Promise.all(events.map(async (e) => {
    const response = await handler(e);
    const expected = {
      statusCode: 200,
      body: `Push from branch: refs/heads/dci#84, commit: 90aa35428f689dbeff1a59b010be25420fa6fdd4`
    };

    t.deepEqual(response, expected);
  }))

  t.end()
});

test('x-hub-signature mismatch with mismatched SecretString', async (t) => {
  t.plan(4);

  const events = [
    sampleEvent.ping,
    sampleEvent.push,
    rawEvent.ping,
    rawEvent.push
  ].map(genEvent('mismatchedSecretString'));

  await Promise.all(events.map(async (e) => {
    const response = await handler(e);
    const expected = {
      statusCode: 500,
      body: 'Err: x-hub-signature mismatch'
    };

    t.deepEqual(response, expected);
  }));

  t.end();
});
