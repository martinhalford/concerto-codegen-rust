'use client'

import { FC, useEffect, useState } from 'react'

import { ContractIds } from '@/deployments/deployments'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  contractQuery,
  contractTx,
  decodeOutput,
  useInkathon,
  useRegisteredContract,
} from '@scio-labs/use-inkathon'
import { SubmitHandler, useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormItem, FormLabel } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { contractTxWithToast } from '@/utils/contract-tx-with-toast'

// Form schemas
const requestDraftSchema = z.object({
  templateData: z.string().min(1, 'Template data is required'),
})

const processRequestSchema = z.object({
  forceMajeure: z.boolean().default(false),
  agreedDelivery: z.string().min(1, 'Agreed delivery date is required'),
  deliveredAt: z.string().optional(),
  goodsValue: z.string().min(1, 'Goods value is required'),
})

type RequestDraftForm = z.infer<typeof requestDraftSchema>
type ProcessRequestForm = z.infer<typeof processRequestSchema>

export const LateDeliveryContractInteractions: FC = () => {
  const { api, activeAccount, activeSigner } = useInkathon()
  const { contract, address: contractAddress } = useRegisteredContract(ContractIds.LateDeliveryAndPenalty)

  // State for contract info
  const [contractInfo, setContractInfo] = useState<{
    owner?: string
    isPaused?: boolean
    forceMajeure?: boolean
    penaltyDuration?: string
    penaltyPercentage?: string
    capPercentage?: string
    termination?: string
    fractionalPart?: string
  }>({})

  const [myDrafts, setMyDrafts] = useState<any[]>([])
  const [isLoadingInfo, setIsLoadingInfo] = useState(false)
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false)
  const [processResult, setProcessResult] = useState<{
    penalty?: string
    buyerMayTerminate?: boolean
  } | null>(null)
  const [transactionHistory, setTransactionHistory] = useState<Array<{
    type: string
    result: any
    timestamp: Date
  }>>([])

  // Forms
  const requestDraftForm = useForm<RequestDraftForm>({
    resolver: zodResolver(requestDraftSchema),
  })

  const processRequestForm = useForm<ProcessRequestForm>({
    resolver: zodResolver(processRequestSchema),
  })

  // Fetch contract information
  const fetchContractInfo = async () => {
    if (!contract || !api) return

    setIsLoadingInfo(true)
    try {
      const [owner, isPaused, forceMajeure, penaltyDuration, penaltyPercentage, capPercentage, termination, fractionalPart] = await Promise.all([
        contractQuery(api, '', contract, 'get_owner'),
        contractQuery(api, '', contract, 'is_paused'),
        contractQuery(api, '', contract, 'get_force_majeure'),
        contractQuery(api, '', contract, 'get_penalty_duration'),
        contractQuery(api, '', contract, 'get_penalty_percentage'),
        contractQuery(api, '', contract, 'get_cap_percentage'),
        contractQuery(api, '', contract, 'get_termination'),
        contractQuery(api, '', contract, 'get_fractional_part'),
      ])

      setContractInfo({
        owner: decodeOutput(owner, contract, 'get_owner').output,
        isPaused: decodeOutput(isPaused, contract, 'is_paused').output,
        forceMajeure: decodeOutput(forceMajeure, contract, 'get_force_majeure').output,
        penaltyDuration: decodeOutput(penaltyDuration, contract, 'get_penalty_duration').output,
        penaltyPercentage: decodeOutput(penaltyPercentage, contract, 'get_penalty_percentage').output,
        capPercentage: decodeOutput(capPercentage, contract, 'get_cap_percentage').output,
        termination: decodeOutput(termination, contract, 'get_termination').output,
        fractionalPart: decodeOutput(fractionalPart, contract, 'get_fractional_part').output,
      })
    } catch (e) {
      console.error('Error fetching contract info:', e)
      toast.error('Error fetching contract information')
    } finally {
      setIsLoadingInfo(false)
    }
  }

  // Fetch user's drafts
  const fetchMyDrafts = async () => {
    if (!contract || !api || !activeAccount) return

    setIsLoadingDrafts(true)
    try {
      const result = await contractQuery(api, '', contract, 'get_my_drafts')
      const { output, isError, decodedOutput } = decodeOutput(result, contract, 'get_my_drafts')
      if (isError) throw new Error(decodedOutput)
      setMyDrafts(output || [])
    } catch (e) {
      console.error('Error fetching drafts:', e)
      toast.error('Error fetching drafts')
      setMyDrafts([])
    } finally {
      setIsLoadingDrafts(false)
    }
  }

  // Request draft
  const handleRequestDraft: SubmitHandler<RequestDraftForm> = async ({ templateData }) => {
    if (!activeAccount || !contract || !activeSigner || !api) {
      toast.error('Wallet not connected. Try again…')
      return
    }

    try {
      const txResult = await contractTxWithToast(api, activeAccount.address, contract, 'request_draft', {}, [templateData])

      // Add to transaction history
      setTransactionHistory(prev => [...prev, {
        type: 'request_draft',
        result: {
          templateData,
          txHash: txResult.extrinsicHash?.toString(),
          blockHash: txResult.blockHash?.toString(),
          blockNumber: txResult.blockNumber?.toString(),
          success: txResult.isCompleted && !txResult.isError
        },
        timestamp: new Date()
      }])

      requestDraftForm.reset()

      // Refresh drafts after submitting
      setTimeout(() => {
        fetchMyDrafts()
      }, 2000) // Wait a bit for the transaction to be processed

      toast.success('Draft request submitted successfully!')
    } catch (e) {
      console.error('Error requesting draft:', e)
      toast.error(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  // Process request
  const handleProcessRequest: SubmitHandler<ProcessRequestForm> = async ({
    forceMajeure,
    agreedDelivery,
    deliveredAt,
    goodsValue
  }) => {
    if (!activeAccount || !contract || !activeSigner || !api) {
      toast.error('Wallet not connected. Try again…')
      return
    }

    try {
      console.log('🚀 Starting process request...')

      // Convert datetime strings to Unix timestamps (seconds)
      const agreedDeliveryTimestamp = Math.floor(new Date(agreedDelivery).getTime() / 1000)
      const deliveredAtTimestamp = deliveredAt ? Math.floor(new Date(deliveredAt).getTime() / 1000) : null

      const request = {
        force_majeure: forceMajeure,
        agreed_delivery: agreedDeliveryTimestamp,
        delivered_at: deliveredAtTimestamp ? { Some: deliveredAtTimestamp } : { None: null },
        goods_value: goodsValue,
      }

      console.log('📝 Request parameters:', {
        forceMajeure,
        agreedDelivery,
        deliveredAt,
        goodsValue,
        agreedDeliveryTimestamp,
        deliveredAtTimestamp,
        requestObject: request
      })

      console.log('📤 Submitting transaction to blockchain...')
      const txStartTime = Date.now()

      // Execute the actual transaction first
      let txResult
      try {
        txResult = await contractTx(api, activeAccount.address, contract, 'process_request', {}, [request])
        // Show success toast manually
        toast.success('Transaction submitted successfully!')
      } catch (txError) {
        console.error('Transaction submission failed:', txError)
        toast.error(`Transaction failed: ${txError instanceof Error ? txError.message : 'Unknown error'}`)
        throw txError
      }

      const txEndTime = Date.now()
      const txDuration = txEndTime - txStartTime

      console.log('✅ Transaction completed!', {
        duration: `${txDuration}ms`,
        isCompleted: txResult.isCompleted,
        isError: txResult.isError,
        extrinsicHash: txResult.extrinsicHash,
        blockHash: txResult.blockHash,
        blockNumber: txResult.blockNumber,
        errorMessage: txResult.errorMessage,
        fullTxResult: txResult
      })

      // If transaction was successful, query the actual result
      let actualResult = null
      // More robust success detection - transaction succeeded if it completed and has no error
      // Also consider it successful if we got an extrinsic hash (means it was submitted to chain)
      const transactionSucceeded = Boolean(
        (txResult?.isCompleted === true &&
          (txResult?.isError === false || txResult?.isError === undefined)) ||
        (txResult?.extrinsicHash && !txResult?.isError)
      )

      console.log('🔍 Transaction success check:', {
        transactionSucceeded,
        isCompleted: txResult?.isCompleted,
        isError: txResult?.isError,
        txResultExists: !!txResult,
        txResultType: typeof txResult,
        hasHash: !!txResult?.extrinsicHash,
        successCheckBreakdown: {
          isCompletedTrue: txResult?.isCompleted === true,
          isErrorFalseOrUndefined: txResult?.isError === false || txResult?.isError === undefined,
          combinedResult: txResult?.isCompleted === true && (txResult?.isError === false || txResult?.isError === undefined)
        }
      })

      if (transactionSucceeded) {
        console.log('📊 Transaction succeeded! Now querying for result...')
        const queryStartTime = Date.now()

        try {
          // Query the contract to get the actual result after transaction
          const queryResult = await contractQuery(api, activeAccount.address, contract, 'process_request', {}, [request])
          const queryEndTime = Date.now()
          const queryDuration = queryEndTime - queryStartTime

          console.log('🔎 Query completed:', {
            duration: `${queryDuration}ms`,
            queryResult,
            gasConsumed: queryResult?.gasConsumed?.toString(),
            gasRequired: queryResult?.gasRequired?.toString()
          })

          const { output, isError, decodedOutput } = decodeOutput(queryResult, contract, 'process_request')

          console.log('🧮 Decoded query result:', {
            output,
            isError,
            decodedOutput,
            rawOutput: JSON.stringify(output, null, 2)
          })

          if (!isError && output) {
            console.log('🎯 Processing result structure...')

            // Handle different possible result structures
            let processedResult = output
            console.log('📋 Initial output:', processedResult)

            // Check if it's wrapped in Ok/Err
            if (output.Ok) {
              processedResult = output.Ok
              console.log('✨ Unwrapped Ok wrapper:', processedResult)
            }

            // Check if it's deeply nested (Result<Result<T, E>, E>)
            if (processedResult.Ok) {
              processedResult = processedResult.Ok
              console.log('✨ Unwrapped nested Ok:', processedResult)
            }

            console.log('🔧 Final processed result:', processedResult)

            // Try different property access patterns with safe checking
            let penalty = processedResult?.penalty ||
              processedResult?.Penalty ||
              (Array.isArray(processedResult) ? processedResult[0] : undefined) ||
              processedResult?.value?.penalty ||
              processedResult?.data?.penalty

            let buyerMayTerminate = processedResult?.buyer_may_terminate ||
              processedResult?.buyerMayTerminate ||
              processedResult?.BuyerMayTerminate ||
              (Array.isArray(processedResult) ? processedResult[1] : undefined) ||
              processedResult?.value?.buyer_may_terminate ||
              processedResult?.data?.buyer_may_terminate

            console.log('💰 Extracted values:', {
              penalty,
              penaltyString: penalty?.toString(),
              buyerMayTerminate,
              penaltyType: typeof penalty,
              buyerMayTerminateType: typeof buyerMayTerminate
            })

            actualResult = {
              penalty: penalty?.toString() || 'N/A',
              buyerMayTerminate: buyerMayTerminate || false,
              request: request // Include request parameters for display
            }

            console.log('✅ Final actualResult:', actualResult)

            // Update the process result state for immediate display
            setProcessResult(actualResult)
          } else {
            console.log('❌ Query returned error or no output:', {
              isError,
              output,
              decodedOutput
            })
          }
        } catch (queryError) {
          console.error('💥 Error querying result after transaction:', {
            error: queryError,
            errorMessage: queryError instanceof Error ? queryError.message : 'Unknown error',
            errorStack: queryError instanceof Error ? queryError.stack : undefined
          })
          // If we can't query the result, we'll mark this in the transaction history
        }
      } else {
        console.log('❌ Transaction failed, skipping result query:', {
          isCompleted: txResult.isCompleted,
          isError: txResult.isError,
          errorMessage: txResult.errorMessage
        })
      }

      // Add to transaction history with actual result (or indicate if we couldn't get it)
      console.log('📚 Adding to transaction history...', {
        transactionSucceeded,
        actualResult,
        resultObtained: actualResult !== null
      })

      const historyEntry = {
        type: 'process_request',
        result: {
          request: {
            force_majeure: request.force_majeure,
            agreed_delivery: request.agreed_delivery,
            delivered_at: request.delivered_at,
            goods_value: request.goods_value
          },
          penalty: actualResult?.penalty || (transactionSucceeded ? 'Query failed - check on-chain' : 'Transaction failed'),
          buyerMayTerminate: actualResult?.buyerMayTerminate || false,
          txHash: txResult.extrinsicHash?.toString(),
          blockHash: txResult.blockHash?.toString(),
          blockNumber: txResult.blockNumber?.toString(),
          success: transactionSucceeded, // Transaction success, regardless of result query
          resultObtained: actualResult !== null
        },
        timestamp: new Date()
      }

      console.log('📝 History entry being added:', historyEntry)

      setTransactionHistory(prev => [...prev, historyEntry])

      processRequestForm.reset()

      console.log('🎉 Final status summary:', {
        transactionSucceeded,
        actualResult,
        resultObtained: actualResult !== null,
        willShowSuccessToast: transactionSucceeded,
        willShowResultInToast: actualResult !== null
      })

      if (transactionSucceeded) {
        if (actualResult) {
          console.log('✅ Showing success toast with result')
          toast.success(`Transaction successful! Penalty: ${actualResult.penalty}, Buyer may terminate: ${actualResult.buyerMayTerminate ? 'Yes' : 'No'}`)
        } else {
          console.log('⚠️ Showing success toast without result')
          toast.success('Transaction successful! Unable to query result immediately.')
        }
      } else {
        console.log('❌ Showing error toast')
        toast.error('Transaction failed')
      }
    } catch (e) {
      console.error('💥 Caught exception during process:', {
        error: e,
        errorMessage: e instanceof Error ? e.message : 'Unknown error',
        errorStack: e instanceof Error ? e.stack : undefined,
        errorType: typeof e
      })

      toast.error(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)

      console.log('📝 Adding failed transaction to history due to exception')

      // Add failed transaction to history
      setTransactionHistory(prev => [...prev, {
        type: 'process_request',
        result: {
          request: {
            force_majeure: forceMajeure,
            agreed_delivery: Math.floor(new Date(agreedDelivery).getTime() / 1000),
            delivered_at: deliveredAt ? { Some: Math.floor(new Date(deliveredAt).getTime() / 1000) } : { None: null },
            goods_value: goodsValue,
          },
          penalty: 'Error',
          buyerMayTerminate: false,
          txHash: 'N/A',
          blockHash: 'N/A',
          blockNumber: 'N/A',
          success: false,
          resultObtained: false
        },
        timestamp: new Date()
      }])

      setProcessResult(null)
    }
  }

  // Toggle pause
  const handleTogglePause = async () => {
    if (!activeAccount || !contract || !activeSigner || !api) {
      toast.error('Wallet not connected. Try again…')
      return
    }

    try {
      const action = contractInfo.isPaused ? 'unpause' : 'pause'
      await contractTxWithToast(api, activeAccount.address, contract, action, {}, [])
      fetchContractInfo()
    } catch (e) {
      console.error('Error toggling pause:', e)
    }
  }

  useEffect(() => {
    if (contract) {
      fetchContractInfo()
      fetchMyDrafts()
    }
  }, [contract, activeAccount])

  if (!api) return null

  return (
    <>
      <div className="flex max-w-[64rem] grow flex-col gap-4">
        <h2 className="text-center font-mono text-gray-400">Late Delivery & Penalty Contract</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Contract Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contract Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Status:</span>
                <span className={contractInfo.isPaused ? 'text-red-500' : 'text-green-500'}>
                  {isLoadingInfo ? 'Loading...' : contractInfo.isPaused ? 'Paused' : 'Active'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Force Majeure:</span>
                <span>{isLoadingInfo ? 'Loading...' : contractInfo.forceMajeure ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span>Penalty Duration:</span>
                <span>{isLoadingInfo ? 'Loading...' : contractInfo.penaltyDuration || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Penalty %:</span>
                <span>{isLoadingInfo ? 'Loading...' : contractInfo.penaltyPercentage || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Cap %:</span>
                <span>{isLoadingInfo ? 'Loading...' : contractInfo.capPercentage || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Termination:</span>
                <span>{isLoadingInfo ? 'Loading...' : contractInfo.termination || 'N/A'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Admin Controls */}
          {activeAccount?.address === contractInfo.owner && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Admin Controls</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleTogglePause}
                  variant={contractInfo.isPaused ? 'default' : 'destructive'}
                  className="w-full"
                >
                  {contractInfo.isPaused ? 'Unpause Contract' : 'Pause Contract'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Request Draft */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Request Draft</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...requestDraftForm}>
                <form
                  onSubmit={requestDraftForm.handleSubmit(handleRequestDraft)}
                  className="space-y-4"
                >
                  <FormItem>
                    <FormLabel>Template Data (JSON)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='{"buyer": "Alice", "seller": "Bob", ...}'
                        {...requestDraftForm.register('templateData')}
                        disabled={requestDraftForm.formState.isSubmitting}
                      />
                    </FormControl>
                  </FormItem>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={requestDraftForm.formState.isSubmitting}
                    isLoading={requestDraftForm.formState.isSubmitting}
                  >
                    Request Draft
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Process Request */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Process Late Delivery Request</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...processRequestForm}>
                <form
                  onSubmit={processRequestForm.handleSubmit(handleProcessRequest)}
                  className="space-y-4"
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      {...processRequestForm.register('forceMajeure')}
                      disabled={processRequestForm.formState.isSubmitting}
                    />
                    <FormLabel>Force Majeure</FormLabel>
                  </div>

                  <FormItem>
                    <FormLabel>Agreed Delivery Date & Time</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...processRequestForm.register('agreedDelivery')}
                        disabled={processRequestForm.formState.isSubmitting}
                      />
                    </FormControl>
                    <p className="text-xs text-gray-500 mt-1">
                      Select the agreed delivery date and time
                    </p>
                  </FormItem>

                  <FormItem>
                    <FormLabel>Actual Delivery Date & Time (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...processRequestForm.register('deliveredAt')}
                        disabled={processRequestForm.formState.isSubmitting}
                      />
                    </FormControl>
                    <p className="text-xs text-gray-500 mt-1">
                      Leave empty if not yet delivered
                    </p>
                  </FormItem>

                  <FormItem>
                    <FormLabel>Goods Value</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="1000000"
                        {...processRequestForm.register('goodsValue')}
                        disabled={processRequestForm.formState.isSubmitting}
                      />
                    </FormControl>
                  </FormItem>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={processRequestForm.formState.isSubmitting}
                    isLoading={processRequestForm.formState.isSubmitting}
                  >
                    Process Request
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Process Results */}
          {processResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Process Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {/* Input Parameters */}
                <div className="bg-gray-50 border border-gray-200 p-3 rounded space-y-2">
                  <div className="font-medium text-gray-700 mb-2">Input Parameters:</div>
                  <div className="flex justify-between text-gray-800">
                    <span>Force Majeure:</span>
                    <span>{processResult.request?.force_majeure ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between text-gray-800">
                    <span>Agreed Delivery:</span>
                    <span className="font-mono text-xs">
                      {processResult.request?.agreed_delivery ?
                        new Date(processResult.request.agreed_delivery * 1000).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-800">
                    <span>Delivered At:</span>
                    <span className="font-mono text-xs">
                      {processResult.request?.delivered_at?.Some ?
                        new Date(processResult.request.delivered_at.Some * 1000).toLocaleString() :
                        'Not delivered'}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-800">
                    <span>Goods Value:</span>
                    <span className="font-mono">{processResult.request?.goods_value || 'N/A'}</span>
                  </div>
                </div>

                {/* Results */}
                <div className="bg-blue-50 border border-blue-200 p-3 rounded space-y-2">
                  <div className="font-medium text-gray-700 mb-2">Calculated Results:</div>
                  <div className="flex justify-between text-gray-800">
                    <span>Penalty Amount:</span>
                    <span className="font-mono text-blue-800 font-semibold">{processResult.penalty || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between text-gray-800">
                    <span>Buyer May Terminate:</span>
                    <span className={`font-semibold ${processResult.buyerMayTerminate ? 'text-red-700' : 'text-green-700'}`}>
                      {processResult.buyerMayTerminate ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProcessResult(null)}
                  className="w-full mt-2"
                >
                  Clear Results
                </Button>
              </CardContent>
            </Card>
          )}

          {/* My Drafts */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">My Drafts</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingDrafts ? (
                <p>Loading drafts...</p>
              ) : myDrafts.length > 0 ? (
                <div className="space-y-2">
                  {myDrafts.map((draft, index) => (
                    <div key={index} className="p-3 border rounded text-sm">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(draft, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No drafts found</p>
              )}
            </CardContent>
          </Card>

          {/* Transaction History */}
          {transactionHistory.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Transaction History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {transactionHistory.slice(-3).reverse().map((tx, index) => (
                    <div key={index} className="p-3 border rounded text-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold capitalize">{tx.type.replace('_', ' ')}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${tx.result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                            {tx.result.success ? 'Success' : 'Failed'} {/* Debug: {JSON.stringify(tx.result.success)} */}
                          </span>
                          <span className="text-gray-500 text-xs">
                            {tx.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      {/* Process Request Results */}
                      {tx.type === 'process_request' && (
                        <div className="space-y-3 mt-2">
                          {/* Input Parameters */}
                          <div className="bg-gray-50 border border-gray-200 p-3 rounded space-y-2 text-sm">
                            <div className="font-medium text-gray-700 mb-2">Input Parameters:</div>
                            <div className="flex justify-between text-gray-800">
                              <span>Force Majeure:</span>
                              <span>{tx.result.request.force_majeure ? 'Yes' : 'No'}</span>
                            </div>
                            <div className="flex justify-between text-gray-800">
                              <span>Agreed Delivery:</span>
                              <span className="font-mono text-xs">
                                {tx.result.request.agreed_delivery ?
                                  new Date(tx.result.request.agreed_delivery * 1000).toLocaleString() : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between text-gray-800">
                              <span>Delivered At:</span>
                              <span className="font-mono text-xs">
                                {tx.result.request.delivered_at?.Some ?
                                  new Date(tx.result.request.delivered_at.Some * 1000).toLocaleString() :
                                  'Not delivered'}
                              </span>
                            </div>
                            <div className="flex justify-between text-gray-800">
                              <span>Goods Value:</span>
                              <span className="font-mono">{tx.result.request.goods_value}</span>
                            </div>
                          </div>

                          {/* Results */}
                          <div className="bg-blue-50 border border-blue-200 p-3 rounded space-y-2 text-sm">
                            <div className="font-medium text-gray-700 mb-2">Calculated Results:</div>
                            <div className="flex justify-between text-gray-800">
                              <span>Penalty Amount:</span>
                              <span className={`font-mono font-semibold ${tx.result.penalty === 'Error' || tx.result.penalty === 'Transaction failed'
                                ? 'text-red-800'
                                : (typeof tx.result.penalty === 'string' && tx.result.penalty.includes('Query failed'))
                                  ? 'text-amber-600'
                                  : 'text-blue-800'
                                }`}>
                                {tx.result.penalty || 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between text-gray-800">
                              <span>Buyer May Terminate:</span>
                              <span className={`font-semibold ${tx.result.buyerMayTerminate ? 'text-red-700' : 'text-green-700'}`}>
                                {tx.result.buyerMayTerminate ? 'Yes' : 'No'}
                              </span>
                            </div>
                            {tx.result.resultObtained === false && tx.result.success && (
                              <div className="text-xs text-amber-600 italic">
                                ⚠️ Transaction successful but result query failed
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Transaction Details */}
                      <div className="mt-2 text-xs text-gray-500">
                        <div className="flex justify-between">
                          <span>Block: #{tx.result.blockNumber}</span>
                          <span className="font-mono truncate ml-2 max-w-32">
                            {tx.result.txHash?.slice(0, 10)}...
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTransactionHistory([])}
                  className="w-full mt-3"
                >
                  Clear History
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Contract Address */}
        <p className="text-center font-mono text-xs text-gray-600">
          {contract ? contractAddress : 'Loading…'}
        </p>
      </div>
    </>
  )
} 