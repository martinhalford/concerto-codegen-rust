'use client'

import { FC, useEffect, useState } from 'react'

import { ContractIds } from '@/deployments/deployments'
import { env } from '@/config/environment'
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { contractTxWithToast } from '@/utils/contract-tx-with-toast'
import { truncateHash } from '@/utils/truncate-hash'

// Types for draft service
interface GeneratedDocument {
  id: string
  requestId: string
  status: 'processing' | 'completed' | 'error'
  format?: string
  documentUrl?: string
  errorMessage?: string
  createdAt: string
  templateData?: any
}

// Form schemas
const requestDraftSchema = z.object({
  clauseId: z.string().min(1, 'Clause ID is required'),
  forceMajeure: z.boolean().default(false),
  penaltyAmount: z.number().min(1, 'Penalty duration must be at least 1'),
  penaltyUnit: z.enum(['days', 'weeks', 'months']).default('days'),
  penaltyPercentage: z.number().min(0.1).max(100, 'Penalty percentage must be between 0.1% and 100%'),
  capPercentage: z.number().min(0.1).max(100, 'Cap percentage must be between 0.1% and 100%'),
  terminationAmount: z.number().min(1, 'Termination period must be at least 1'),
  terminationUnit: z.enum(['days', 'weeks', 'months']).default('days'),
  fractionalPart: z.enum(['days', 'weeks', 'months']).default('days'),
  outputFormat: z.enum(['md', 'pdf']).default('md'),
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
  const [generatedDocuments, setGeneratedDocuments] = useState<GeneratedDocument[]>([])
  const [isLoadingInfo, setIsLoadingInfo] = useState(false)
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false)
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [processResult, setProcessResult] = useState<{
    penalty?: string
    buyerMayTerminate?: boolean
    request?: any
  } | null>(null)
  const [transactionHistory, setTransactionHistory] = useState<Array<{
    type: string
    result: any
    timestamp: Date
  }>>([])

  // Forms
  const requestDraftForm = useForm<RequestDraftForm>({
    resolver: zodResolver(requestDraftSchema),
    defaultValues: {
      clauseId: 'test-clause-1',
      forceMajeure: false,
      penaltyAmount: 3,
      penaltyUnit: 'days',
      penaltyPercentage: 10.5,
      capPercentage: 55,
      terminationAmount: 15,
      terminationUnit: 'days',
      fractionalPart: 'days',
      outputFormat: 'md',
    },
  })

  const processRequestForm = useForm<ProcessRequestForm>({
    resolver: zodResolver(processRequestSchema),
    defaultValues: {
      forceMajeure: false,
      agreedDelivery: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16), // 7 days ago
      deliveredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16), // 5 days ago (2 days late)
      goodsValue: '1000000',
    },
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

  // Fetch generated documents from draft service
  const fetchGeneratedDocuments = async () => {
    if (!activeAccount) return

    setIsLoadingDocuments(true)
    try {
      const response = await fetch(`${env.draftServiceUrl}/documents?address=${activeAccount.address}`)
      if (response.ok) {
        const documents = await response.json()
        setGeneratedDocuments(documents)
      } else {
        console.error('Failed to fetch documents:', response.statusText)
      }
    } catch (e) {
      console.error('Error fetching documents from draft service:', e)
      // Don't show error toast as this might be expected if service is not running
    } finally {
      setIsLoadingDocuments(false)
    }
  }

  // Request draft
  const handleRequestDraft: SubmitHandler<RequestDraftForm> = async ({
    clauseId,
    forceMajeure,
    penaltyAmount,
    penaltyUnit,
    penaltyPercentage,
    capPercentage,
    terminationAmount,
    terminationUnit,
    fractionalPart,
    outputFormat
  }) => {
    if (!activeAccount || !contract || !activeSigner || !api) {
      toast.error('Wallet not connected. Try again…')
      return
    }

    try {
      // Construct the template data JSON from form fields
      const templateData = {
        "$class": "io.clause.latedeliveryandpenalty@0.1.0.LateDeliveryAndPenalty",
        "clauseId": clauseId,
        "forceMajeure": forceMajeure,
        "penaltyDuration": {
          "$class": "org.accordproject.time@0.3.0.Duration",
          "amount": penaltyAmount,
          "unit": penaltyUnit
        },
        "penaltyPercentage": penaltyPercentage,
        "capPercentage": capPercentage,
        "termination": {
          "$class": "org.accordproject.time@0.3.0.Duration",
          "amount": terminationAmount,
          "unit": terminationUnit
        },
        "fractionalPart": fractionalPart,
        "_outputFormat": outputFormat
      }

      const enhancedTemplateData = JSON.stringify(templateData)

      const txResult = await contractTxWithToast(api, activeAccount.address, contract, 'request_draft', {}, [enhancedTemplateData])

      // Add to transaction history
      setTransactionHistory(prev => [...prev, {
        type: 'request_draft',
        result: {
          templateData,
          outputFormat,
          txHash: txResult.extrinsicHash?.toString(),
          blockHash: txResult.blockHash?.toString(),
          blockNumber: (txResult as any).blockNumber?.toString(),
          success: (txResult as any).isCompleted && !(txResult as any).isError
        },
        timestamp: new Date()
      }])

      requestDraftForm.reset()

      // Refresh drafts after submitting
      setTimeout(() => {
        fetchMyDrafts()
        fetchGeneratedDocuments() // Also refresh generated documents
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
        isCompleted: (txResult as any).isCompleted,
        isError: (txResult as any).isError,
        extrinsicHash: txResult.extrinsicHash,
        blockHash: txResult.blockHash,
        blockNumber: (txResult as any).blockNumber,
        errorMessage: (txResult as any).errorMessage,
        fullTxResult: txResult
      })

      // If transaction was successful, query the actual result
      let actualResult = null
      // More robust success detection - transaction succeeded if it completed and has no error
      // Also consider it successful if we got an extrinsic hash (means it was submitted to chain)
      const transactionSucceeded = Boolean(
        ((txResult as any)?.isCompleted === true &&
          ((txResult as any)?.isError === false || (txResult as any)?.isError === undefined)) ||
        (txResult?.extrinsicHash && !(txResult as any)?.isError)
      )

      console.log('🔍 Transaction success check:', {
        transactionSucceeded,
        isCompleted: (txResult as any)?.isCompleted,
        isError: (txResult as any)?.isError,
        txResultExists: !!txResult,
        txResultType: typeof txResult,
        hasHash: !!txResult?.extrinsicHash,
        successCheckBreakdown: {
          isCompletedTrue: (txResult as any)?.isCompleted === true,
          isErrorFalseOrUndefined: (txResult as any)?.isError === false || (txResult as any)?.isError === undefined,
          combinedResult: (txResult as any)?.isCompleted === true && ((txResult as any)?.isError === false || (txResult as any)?.isError === undefined)
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
          isCompleted: (txResult as any).isCompleted,
          isError: (txResult as any).isError,
          errorMessage: (txResult as any).errorMessage
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
          blockNumber: (txResult as any).blockNumber?.toString(),
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
      fetchGeneratedDocuments()
    }
  }, [contract, activeAccount])

  // Periodically check for new documents
  useEffect(() => {
    if (!activeAccount) return

    const interval = setInterval(() => {
      fetchGeneratedDocuments()
    }, 10000) // Check every 10 seconds

    return () => clearInterval(interval)
  }, [activeAccount])

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
                <span>Address:</span>
                <span className="font-mono text-xs">
                  {contract ? truncateHash(contractAddress?.toString() || '', 8) : 'Loading…'}
                </span>
              </div>
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
                  {/* Basic Information */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-800 border-b pb-1">Basic Information</h4>

                    <FormField
                      control={requestDraftForm.control}
                      name="clauseId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Clause ID</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., test-clause-1"
                              {...field}
                              disabled={requestDraftForm.formState.isSubmitting}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        {...requestDraftForm.register('forceMajeure')}
                        disabled={requestDraftForm.formState.isSubmitting}
                      />
                      <FormLabel>Force Majeure</FormLabel>
                    </div>
                  </div>

                  {/* Penalty Terms */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-800 border-b pb-1">Penalty Terms</h4>

                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={requestDraftForm.control}
                        name="penaltyAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Penalty Duration</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                placeholder="3"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                disabled={requestDraftForm.formState.isSubmitting}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={requestDraftForm.control}
                        name="penaltyUnit"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unit</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger disabled={requestDraftForm.formState.isSubmitting}>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="days">Days</SelectItem>
                                <SelectItem value="weeks">Weeks</SelectItem>
                                <SelectItem value="months">Months</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={requestDraftForm.control}
                        name="penaltyPercentage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Penalty Percentage (%)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.1"
                                min="0.1"
                                max="100"
                                placeholder="10.5"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                disabled={requestDraftForm.formState.isSubmitting}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={requestDraftForm.control}
                        name="capPercentage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cap Percentage (%)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.1"
                                min="0.1"
                                max="100"
                                placeholder="55"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                disabled={requestDraftForm.formState.isSubmitting}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Termination Terms */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-800 border-b pb-1">Termination Terms</h4>

                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={requestDraftForm.control}
                        name="terminationAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Termination Period</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                placeholder="15"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                disabled={requestDraftForm.formState.isSubmitting}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={requestDraftForm.control}
                        name="terminationUnit"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unit</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger disabled={requestDraftForm.formState.isSubmitting}>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="days">Days</SelectItem>
                                <SelectItem value="weeks">Weeks</SelectItem>
                                <SelectItem value="months">Months</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={requestDraftForm.control}
                      name="fractionalPart"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fractional Part</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger disabled={requestDraftForm.formState.isSubmitting}>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="days">Days</SelectItem>
                              <SelectItem value="weeks">Weeks</SelectItem>
                              <SelectItem value="months">Months</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-500 mt-1">
                            Time unit for fractional calculations
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Output Format */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-800 border-b pb-1">Output Options</h4>

                    <FormField
                      control={requestDraftForm.control}
                      name="outputFormat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Output Format</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              className="flex space-x-6"
                              disabled={requestDraftForm.formState.isSubmitting}
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="md" id="md" />
                                <Label htmlFor="md">Markdown</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="pdf" id="pdf" />
                                <Label htmlFor="pdf">PDF</Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <p className="text-xs text-gray-500">
                            Choose the format for your generated contract document
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

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

          {/* Generated Documents */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-base">Generated Documents</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchGeneratedDocuments}
                  disabled={isLoadingDocuments}
                  isLoading={isLoadingDocuments}
                >
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingDocuments ? (
                <p className="text-gray-500">Loading documents...</p>
              ) : generatedDocuments.length > 0 ? (
                <div className="space-y-3">
                  {generatedDocuments.map((document, index) => (
                    <div key={document.id || index} className="p-4 border rounded-lg bg-gray-50">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-semibold text-gray-900">Contract Draft #{document.requestId}</h4>
                          <p className="text-xs text-gray-500">ID: {document.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded font-medium ${document.status === 'completed'
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : document.status === 'processing'
                              ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                              : 'bg-red-100 text-red-800 border border-red-200'
                            }`}>
                            {document.status === 'completed' ? '✓ Completed' :
                              document.status === 'processing' ? '⏳ Processing' : '✗ Error'}
                          </span>
                        </div>
                      </div>

                      {/* Document Details */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Created:</span>
                          <span className="font-mono text-xs text-gray-800">
                            {new Date(document.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {document.format && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Format:</span>
                            <span className={`text-xs px-2 py-1 rounded font-medium ${document.format === 'pdf'
                              ? 'bg-red-100 text-red-800 border border-red-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}>
                              {document.format.toUpperCase()}
                            </span>
                          </div>
                        )}

                        {document.status === 'completed' && document.documentUrl && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Document:</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(document.documentUrl, '_blank')}
                              className="h-6 px-2 text-xs"
                            >
                              {document.format === 'pdf' ? '📕' : '📄'} {document.format === 'pdf' ? 'View PDF' : 'View/Download'}
                            </Button>
                          </div>
                        )}

                        {document.status === 'error' && document.errorMessage && (
                          <div className="text-sm">
                            <span className="text-gray-600">Error:</span>
                            <p className="text-red-600 text-xs mt-1 p-2 bg-red-50 rounded border border-red-100">
                              {document.errorMessage}
                            </p>
                          </div>
                        )}

                        {document.templateData && (
                          <details className="text-xs">
                            <summary className="text-gray-600 cursor-pointer hover:text-gray-800">
                              Template Data
                            </summary>
                            <pre className="mt-2 p-2 bg-white rounded border text-gray-700 overflow-x-auto">
                              {JSON.stringify(document.templateData, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">No generated documents found</p>
                  <p className="text-xs text-gray-400">
                    Documents will appear here after you request a draft and the service processes it
                  </p>
                </div>
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
      </div>
    </>
  )
} 