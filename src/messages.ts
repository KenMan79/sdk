import { session } from './state'
import { createEventLog, networkName, serverEcho, last } from './utilities'

import { Ac, Tx, Emitter, EventObject, TransactionHandler, Client } from './interfaces'

export function sendMessage(msg: EventObject) {
  session.socket.send(createEventLog(msg))
}

export function handleMessage(msg: { data: string }): void {
  const { status, reason, event, nodeSyncStatus, connectionId } = JSON.parse(msg.data)
  console.log(JSON.parse(msg.data))
  if (connectionId) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('connectionId', connectionId)
    } else {
      session.connectionId = connectionId
    }
  }

  // handle node sync status change
  if (
    nodeSyncStatus !== undefined &&
    nodeSyncStatus.blockchain === 'ethereum' &&
    nodeSyncStatus.network === networkName(session.networkId)
  ) {
    session.status.nodeSynced = nodeSyncStatus.synced
  }

  // handle any errors from the server
  if (status === 'error') {
    if (reason.includes('not a valid API key')) {
      const errorObj = new Error(reason)
      throw errorObj
    }

    if (reason.includes('network not supported')) {
      const errorObj = new Error(reason)
      throw errorObj
    }

    if (reason.includes('maximum allowed amount')) {
      const errorObj = new Error(reason)
      throw errorObj
    }
  }

  if (event && event.transaction) {
    const { transaction, eventCode, contractCall } = event

    // flatten in to one object
    const newState = { ...transaction, eventCode, contractCall }

    // ignore server echo messages
    if (serverEcho(eventCode)) {
      return
    }

    // handle change of hash in speedup and cancel events
    if (eventCode === 'txSpeedUp' || eventCode === 'txCancel') {
      session.clients.forEach((client: Client) => {
        client.transactions = client.transactions.map((tx: Tx) => {
          if (tx.hash === transaction.originalHash) {
            // reassign hash parameter in transaction queue to new hash
            tx.hash = transaction.hash
          }
          return tx
        })
      })
    }

    const watchedAddress = transaction.watchedAddress && transaction.watchedAddress.toLowerCase()

    if (watchedAddress) {
      session.clients.forEach((client: Client) => {
        const { transactionHandlers, accounts } = client

        const accountObj = accounts.find((ac: Ac) => ac.address === watchedAddress)

        // no accountObj then this client isn't concerned with this notification
        if (!accountObj) return

        let emitterResult =
          accountObj && last(accountObj.emitters.map((emitter: Emitter) => emitter.emit(newState)))

        transactionHandlers.forEach((handler: TransactionHandler) =>
          handler({ transaction: newState, emitterResult })
        )
      })
    } else {
      session.clients.forEach((client: Client) => {
        const { transactionHandlers, transactions } = client

        const transactionObj = transactions.find((tx: Tx) => tx.hash === transaction.hash)

        // no transactionObj then this client isn't concerned with this notification
        if (!transactionObj) return

        let emitterResult = transactionObj && transactionObj.emitter.emit(newState)

        transactionHandlers.forEach((handler: TransactionHandler) =>
          handler({ transaction: newState, emitterResult })
        )
      })
    }
  }
}
