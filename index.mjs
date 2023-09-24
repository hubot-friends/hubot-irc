import { Client } from 'irc'
import { IrcAdapter, IrcResponse } from './IrcAdapter.mjs'

export default {
  use(robot) {
    const config = {
      nick: robot.name ?? robot.alias ?? process.env.HUBOT_IRC_NICK,
      realName: process.env.HUBOT_IRC_REALNAME ?? robot.name ?? robot.alias,
      port: process.env.HUBOT_IRC_PORT ?? 6667,
      rooms: process.env?.HUBOT_IRC_ROOMS?.split(','),
      ignoreUsers: process.env?.HUBOT_IRC_IGNORE_USERS?.split(',') ?? [],
      server: process.env.HUBOT_IRC_SERVER,
      password: process.env?.HUBOT_IRC_PASSWORD,
      nickpass: process.env?.HUBOT_IRC_NICKSERV_PASSWORD,
      nickusername: process.env?.HUBOT_IRC_NICKSERV_USERNAME,
      connectCommand: process.env?.HUBOT_IRC_CONNECT_COMMAND,
      fakessl: process.env?.HUBOT_IRC_FAKE_SSL,
      certExpired: process.env?.HUBOT_IRC_CERT_EXPIRED != undefined,
      unflood: process.env?.HUBOT_IRC_UNFLOOD,
      debug: process.env?.HUBOT_IRC_DEBUG != undefined,
      usessl: process.env?.HUBOT_IRC_USESSL != undefined,
      userName: process.env?.HUBOT_IRC_USERNAME ?? robot.name ?? robot.alias,
      usesasl: process.env?.HUBOT_IRC_USESASL != undefined,
      isPrivate: process.env?.HUBOT_IRC_PRIVATE != undefined,
      shouldIgnoreInvite: process.env?.HUBOT_IRC_IGNORE_INVITES != undefined,
      isSendNoticeModeOn: process.env?.HUBOT_IRC_SEND_NOTICE_MODE_ON != undefined,
    }
    const clientOptions = {
      userName: config.userName,
      realName: config.realName,
      password: config.password,
      debug: config.debug,
      port: config.port,
      stripColors: true,
      secure: config.usessl,
      sasl: config.usesasl,
      selfSigned: config.fakessl,
      certExpired: config.certExpired,
      floodProtection: IrcAdapter.unfloodProtection(config.unflood),
      floodProtectionDelay: IrcAdapter.unfloodProtectionDelay(config.unflood),
      autoRejoin: true,
      retryCount: Infinity
    }
    if(!config.nickpass) clientOptions.channels = config.rooms
    robot.Response = IrcResponse
    robot.config = config
    return new IrcAdapter(robot, new Client(config.server, config.nick, clientOptions))
  }
}