'use client'

import { FC, useEffect, useState } from 'react'

import { ContractIds } from '@/deployments/deployments'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  contractQuery,
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
  agreedDelivery: z.string().min(1, 'Agreed delivery timestamp is required'),
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
      console.log('Submitting draft request:', templateData)
      
      const txResult = await contractTxWithToast(api, activeAccount.address, contract, 'request_draft', {}, [templateData])
      console.log('Draft request transaction result:', txResult)
      
      // Add to transaction history
      setTransactionHistory(prev => [...prev, {
        type: 'request_draft',
        result: { 
          templateData, 
          txHash: txResult.extrinsicHash?.toString(),
          blockHash: txResult.blockHash?.toString(),
          blockNumber: txResult.blockNumber?.toString(),
          isCompleted: txResult.isCompleted,
          isError: txResult.isError,
          contractEvents: txResult.contractEvents?.map((event: any) => ({
            name: event.event?.identifier || 'Unknown',
            data: event.event?.data?.toString() || 'No data'
          })),
          gasConsumed: txResult.dryResult?.gasConsumed?.toString(),
          success: txResult.isCompleted && !txResult.isError && !txResult.dispatchError
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
      const request = {
        force_majeure: forceMajeure,
        agreed_delivery: parseInt(agreedDelivery),
        delivered_at: deliveredAt ? { Some: parseInt(deliveredAt) } : { None: null },
        goods_value: goodsValue,
      }

      console.log('Submitting request:', request)
      console.log('Request structure details:', {
        force_majeure: request.force_majeure,
        agreed_delivery: request.agreed_delivery,
        delivered_at: request.delivered_at,
        goods_value: request.goods_value,
        agreed_delivery_date: new Date(request.agreed_delivery * 1000).toISOString(),
        delivered_at_date: request.delivered_at?.Some ? new Date(request.delivered_at.Some * 1000).toISOString() : 'Not delivered',
        delay_seconds: request.delivered_at?.Some ? (request.delivered_at.Some - request.agreed_delivery) : 'N/A'
      })

      // First, do a dry-run to see what the result would be
      try {
        const dryRunResult = await contractQuery(api, activeAccount.address, contract, 'process_request', {}, [request])
        const { output, isError, decodedOutput } = decodeOutput(dryRunResult, contract, 'process_request')
        
        console.log('Raw dry run result:', dryRunResult)
        console.log('Raw dry run result stringified:', JSON.stringify(dryRunResult, null, 2))
        console.log('Dry run result output field:', dryRunResult.output)
        console.log('Dry run result result field:', dryRunResult.result)
        
        if (!isError && output) {
          // Handle different possible result structures
          let processedResult = output
          
          // Check if it's wrapped in Ok/Err
          if (output.Ok) {
            processedResult = output.Ok
          }
          
          // Check if it's deeply nested (Result<Result<T, E>, E>)
          if (processedResult.Ok) {
            processedResult = processedResult.Ok
          }
          
          console.log('Processed result:', processedResult)
          console.log('Processed result type:', typeof processedResult)
          console.log('Processed result keys:', processedResult ? Object.keys(processedResult) : 'No keys')
          
          // Try different property access patterns
          let penalty = processedResult?.penalty || 
                       processedResult?.Penalty || 
                       processedResult?.[0] || // Array access
                       processedResult?.value?.penalty ||
                       processedResult?.data?.penalty
          
          let buyerMayTerminate = processedResult?.buyer_may_terminate || 
                                 processedResult?.buyerMayTerminate ||
                                 processedResult?.BuyerMayTerminate ||
                                 processedResult?.[1] || // Array access
                                 processedResult?.value?.buyer_may_terminate ||
                                 processedResult?.data?.buyer_may_terminate
          
          console.log('Extracted penalty:', penalty)
          console.log('Extracted buyerMayTerminate:', buyerMayTerminate)
          
          setProcessResult({
            penalty: penalty?.toString() || 'N/A',
            buyerMayTerminate: buyerMayTerminate
          })
          
          console.log('Set process result:', {
            penalty: penalty?.toString() || 'N/A',
            buyerMayTerminate: buyerMayTerminate
          })
        } else {
          console.log('Dry run failed or no output:', { isError, decodedOutput })
        }
      } catch (dryRunError) {
        console.log('Dry run failed, proceeding with transaction:', dryRunError)
      }

      // Execute the actual transaction
      const txResult = await contractTxWithToast(api, activeAccount.address, contract, 'process_request', {}, [request])
      console.log('Transaction result:', txResult)
      
      // Add to transaction history
      setTransactionHistory(prev => [...prev, {
        type: 'process_request',
        result: { 
          request, 
          txHash: txResult.extrinsicHash?.toString(),
          blockHash: txResult.blockHash?.toString(),
          blockNumber: txResult.blockNumber?.toString(),
          isCompleted: txResult.isCompleted,
          isError: txResult.isError,
          contractEvents: txResult.contractEvents?.map((event: any) => ({
            name: event.event?.identifier || 'Unknown',
            data: event.event?.data?.toString() || 'No data'
          })),
          gasConsumed: txResult.dryResult?.gasConsumed?.toString(),
          success: txResult.isCompleted && !txResult.isError && !txResult.dispatchError
        },
        timestamp: new Date()
      }])
      
      processRequestForm.reset()
      
      if (processResult) {
        toast.success(`Penalty: ${processResult.penalty || 'N/A'}, Buyer may terminate: ${processResult.buyerMayTerminate ? 'Yes' : 'No'}`)
      } else {
        toast.success('Process request transaction completed successfully!')
      }
    } catch (e) {
      console.error('Error processing request:', e)
      toast.error(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
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
                    <FormLabel>Agreed Delivery (timestamp)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="1640995200"
                        {...processRequestForm.register('agreedDelivery')}
                        disabled={processRequestForm.formState.isSubmitting}
                      />
                    </FormControl>
                  </FormItem>

                  <FormItem>
                    <FormLabel>Delivered At (optional timestamp)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="1641081600"
                        {...processRequestForm.register('deliveredAt')}
                        disabled={processRequestForm.formState.isSubmitting}
                      />
                    </FormControl>
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
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Calculated Penalty:</span>
                  <span className="font-mono">{processResult.penalty || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Buyer May Terminate:</span>
                  <span className={processResult.buyerMayTerminate ? 'text-red-500' : 'text-green-500'}>
                    {processResult.buyerMayTerminate ? 'Yes' : 'No'}
                  </span>
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

          {/* Debug Section - Temporary */}
          <Card className="lg:col-span-2 border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-base text-orange-800">Debug Info (Temporary)</CardTitle>
            </CardHeader>
            <CardContent className="text-xs">
              <div className="space-y-2">
                <div>
                  <span className="font-semibold">Process Result State:</span>
                  <pre className="bg-white p-2 rounded mt-1 overflow-auto max-h-32">
                    {JSON.stringify(processResult, null, 2)}
                  </pre>
                </div>
                
                <div>
                  <span className="font-semibold">Contract Settings (might affect penalty calculation):</span>
                  <div className="bg-white p-2 rounded mt-1">
                    <div><strong>Contract Address:</strong> {contractAddress}</div>
                    <div><strong>Expected Address:</strong> 5HVTBVbgNvQWHRmYaQkQgGCxHRFt5pZpz2nNgijyTSDLTraf</div>
                    <div className={contractAddress === "5HVTBVbgNvQWHRmYaQkQgGCxHRFt5pZpz2nNgijyTSDLTraf" ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                      {contractAddress === "5HVTBVbgNvQWHRmYaQkQgGCxHRFt5pZpz2nNgijyTSDLTraf" ? "✓ Correct Contract" : "✗ Wrong Contract"}
                    </div>
                    <hr className="my-1"/>
                    <div>Penalty Duration: {contractInfo.penaltyDuration} seconds</div>
                    <div>Penalty Percentage: {contractInfo.penaltyPercentage}%</div>
                    <div>Cap Percentage: {contractInfo.capPercentage}%</div>
                    <div>Force Majeure: {contractInfo.forceMajeure ? 'Yes' : 'No'}</div>
                  </div>
                </div>
                
                <div className="text-orange-700">
                  <strong>Console Debugging:</strong><br/>
                  1. Look for "Raw dry run result:" - shows the complete contract response<br/>
                  2. Look for "Processed result:" - shows what we extracted<br/>
                  3. Look for "Processed result keys:" - shows available properties<br/>
                  4. Look for "Extracted penalty:" and "Extracted buyerMayTerminate:" - shows individual values<br/>
                  <br/>
                  <strong>Penalty Logic Analysis:</strong><br/>
                  - If penalty is 0, check if: delivery was on time, force majeure applies, or penalty duration has passed<br/>
                  - Delivered At (1641081600) vs Agreed Delivery (1640995200) = {
                    ((1641081600 - 1640995200) / 86400).toFixed(1)
                  } days late<br/>
                  - Delay in seconds: {(1641081600 - 1640995200).toLocaleString()}<br/>
                  - Contract penalty duration: {contractInfo.penaltyDuration} seconds<br/>
                  - Contract penalty rate: {contractInfo.penaltyPercentage}%<br/>
                  - Contract cap: {contractInfo.capPercentage}%<br/>
                  <br/>
                  <strong>Expected Penalty Calculation:</strong><br/>
                  - Goods Value: 1,000,000<br/>
                  - If 20% penalty rate → Expected: {(1000000 * 0.20).toLocaleString()}<br/>
                  - If 30% cap applies → Max penalty: {(1000000 * 0.30).toLocaleString()}<br/>
                  <br/>
                  <strong>Possible Issues:</strong><br/>
                  - Contract settings not loaded from new deployment<br/>
                  - Additional contract logic conditions not met<br/>
                  - Penalty duration or other parameters preventing calculation
                </div>
              </div>
            </CardContent>
          </Card>

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
                  {transactionHistory.slice(-5).reverse().map((tx, index) => (
                    <div key={index} className="p-3 border rounded text-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold capitalize">{tx.type.replace('_', ' ')}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          tx.result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {tx.result.success ? 'Success' : 'Failed'}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {tx.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="font-semibold">Tx Hash:</span>
                            <div className="font-mono text-gray-600 break-all">
                              {tx.result.txHash || 'N/A'}
                            </div>
                          </div>
                          <div>
                            <span className="font-semibold">Block:</span>
                            <div className="font-mono text-gray-600">
                              #{tx.result.blockNumber || 'N/A'}
                            </div>
                          </div>
                        </div>
                        
                        {tx.result.gasConsumed && (
                          <div>
                            <span className="font-semibold">Gas Consumed:</span>
                            <span className="font-mono text-gray-600 ml-1">
                              {tx.result.gasConsumed}
                            </span>
                          </div>
                        )}
                        
                        {tx.result.contractEvents && tx.result.contractEvents.length > 0 && (
                          <div>
                            <span className="font-semibold">Events:</span>
                            <div className="ml-2">
                              {tx.result.contractEvents.map((event: any, eventIndex: number) => (
                                <div key={eventIndex} className="text-gray-600">
                                  • {event.name}: {event.data}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {tx.type === 'process_request' && tx.result.request && (
                          <div>
                            <span className="font-semibold">Request Data:</span>
                            <div className="bg-gray-50 p-2 rounded mt-1 space-y-1">
                              <div>
                                <span className="font-medium">Force Majeure:</span> 
                                <span className="ml-1">{tx.result.request.force_majeure ? 'Yes' : 'No'}</span>
                              </div>
                              <div>
                                <span className="font-medium">Agreed Delivery:</span> 
                                <span className="ml-1">
                                  {tx.result.request.agreed_delivery ? 
                                    new Date(Number(tx.result.request.agreed_delivery) * 1000).toLocaleString() : 
                                    'N/A'
                                  }
                                </span>
                              </div>
                              <div>
                                <span className="font-medium">Delivered At:</span> 
                                <span className="ml-1">
                                  {tx.result.request.delivered_at?.Some ? 
                                    new Date(Number(tx.result.request.delivered_at.Some) * 1000).toLocaleString() : 
                                    'Not delivered'
                                  }
                                </span>
                              </div>
                              <div>
                                <span className="font-medium">Goods Value:</span> 
                                <span className="ml-1">{tx.result.request.goods_value}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {tx.type === 'request_draft' && tx.result.templateData && (
                          <div>
                            <span className="font-semibold">Template Data:</span>
                            <div className="bg-gray-50 p-2 rounded mt-1 font-mono">
                              {tx.result.templateData}
                            </div>
                          </div>
                        )}
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