/* eslint-disable prefer-const */
import Twitter from 'twitter'
import {getInvitationCode} from '../../shared/utils/get-invitation'

export default async (req, res) => {
  const client = new Twitter({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  })

  const ONE_YEAR = 1000 * 60 * 60 * 24 * 365
  const IDENA_TWITTER_NAME = 'IdenaNetwork'
  const minTwitterSubs = process.env.NEXT_PUBLIC_TWITTER_MINIMUM_SUBS_COUNT || 100
  const minTwitterAge = process.env.TWITTER_AGE_MILLIS || 2592000000
  const currentEpoch = await fetch('https://api.idena.io/api/epoch/last')
  const currentEpochJson = await currentEpoch.json()
  const previousEpoch = await fetch(
    `https://api.idena.io/api/epoch/${currentEpochJson.result.epoch - 1}`
  )
  const previousEpochJson = await previousEpoch.json()
  if (!previousEpochJson.result) {
    return res.status(400).send('Something went wrong')
  }
  let userResponse
  let followResponse
  let tweetResponse
  let codeResponse

  try {
    userResponse = await client.get('users/lookup', {
      screen_name: req.query.screen_name,
    })
  } catch (e) {
    return res.status(400).send('Something went wrong')
  }

  if (userResponse?.errors?.[0]?.code === 17) {
    return res.status(400).send('Can not find the Twitter account')
  }
  if (!userResponse.length) {
    return res.status(400).send('Something went wrong')
  }

  const user = userResponse[0]

  try {
    followResponse = await client.get('friendships/show', {
      source_screen_name: req.query.screen_name,
      target_screen_name: IDENA_TWITTER_NAME,
    })
  } catch (e) {
    return res.status(400).send('Something went wrong')
  }

  if (!followResponse.relationship.source.following) {
    return res.status(400).send('Please follow @IdenaNetwork on twitter')
  }

  if (
    user.followers_count < minTwitterSubs ||
    Date.now() - Date.parse(user.created_at) < minTwitterAge
  ) {
    return res.status(400).send('Your twitter account is too new or has too few subscribers')
  }

  if (user.status?.text) {
    const {text} = user.status
    if (
      text.includes('@IdenaNetwork') &&
      text.includes('#IdenaInvite') &&
      Date.parse(previousEpochJson.result.validationTime) <
        Date.parse(user.status.created_at)
    ) {
      try {
        codeResponse = await getInvitationCode(
          user.id_str,
          user.screen_name,
          currentEpochJson.result.epoch,
          req.query.refId ? req.query.refId : null
        )
        return res.status(200).send(codeResponse)
      } catch (e) {
        return res.status(400).send(e.message)
      }
    }
  }

  try {
    tweetResponse = await client.get('search/tweets', {
      q: `from:${req.query.screen_name} @IdenaNetwork #IdenaInvite -is:retweet`,
    })
  } catch (e) {
    return res.status(400).send('Can not verify your tweet')
  }

  if (
    !tweetResponse?.statuses?.length ||
    Date.parse(previousEpochJson.result.validationTime) >
      Date.parse(tweetResponse?.statuses[0]?.created_at)
  ) {
    return res.status(400).send('Can not verify your tweet')
  }

  try {
    codeResponse = await getInvitationCode(
      user.id_str,
      user.screen_name,
      currentEpochJson.result.epoch,
      req.query.refId ? req.query.refId : null
    )
    return res.status(200).send(codeResponse)
  } catch (e) {
    return res.status(400).send(e.message)
  }
}
