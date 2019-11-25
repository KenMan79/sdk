import SturdyWebSocket from 'sturdy-websocket'

import transaction from './transaction'
import account from './account'
import event from './event'

import { sendMessage, handleMessage } from './messages'
import { session } from './state'

import { InitializationOptions, Ac, API, Client } from './interfaces'
import { validateOptions } from './validation'

let clientIndex: number = 0

export default function sdk(options: InitializationOptions): API {
  validateOptions(options)

  const { dappId, networkId, transactionHandlers = [], apiUrl, ws } = options
  const alreadyConnected = !!session.socket

  session.networkId = networkId
  session.clients.push({
    transactionHandlers,
    transactions: [],
    accounts: []
  })

  let websocket_addr = 'wss://dappkit.io:6999'

  if (!alreadyConnected) {
    if (ws) {
      session.socket = new SturdyWebSocket(apiUrl || websocket_addr, 'echo-protocol', {
        wsConstructor: ws
      })
    } else {
      session.socket = new SturdyWebSocket(apiUrl || websocket_addr, 'echo-protocol')
    }

    session.socket.onopen = () => {
      session.status.connected = true

      const connectionId =
        (typeof window !== 'undefined' && window.localStorage.getItem('connectionId')) ||
        session.connectionId

      sendMessage({
        categoryCode: 'initialize',
        eventCode: 'checkDappId',
        connectionId
      })
    }

    session.socket.ondown = () => {
      session.status.connected = false
    }

    session.socket.onreopen = () => {
      session.status.connected = true

      const connectionId =
        (typeof window !== 'undefined' && window.localStorage.getItem('connectionId')) ||
        session.connectionId

      sendMessage({
        categoryCode: 'initialize',
        eventCode: 'checkDappId',
        connectionId
      })

      // re-register all accounts to be watched by server upon
      // re-connection as they don't get transferred over automatically
      // to the new connection like tx hashes do
      session.clients.forEach((client: Client) => {
        client.accounts.forEach((account: Ac) => {
          sendMessage({
            eventCode: 'accountAddress',
            categoryCode: 'watch',
            account: {
              address: account.address
            }
          })
        })
      })
    }

    session.socket.onmessage = handleMessage
  }
  return {
    transaction,
    account,
    event,
    status: session.status,
    clientIndex: clientIndex++
  }
}
