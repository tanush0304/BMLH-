// @vitest-environment jsdom
// Mark Stage Complete (2026-11-11): only at processed >= target; supervisor /
// admin get the button + a confirm dialog that also opens once by itself
// (promptKey); operators get "ask a supervisor"; nothing completes without a
// confirm.
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StageCompleteControl from './StageCompleteControl'
import { stageReachedTarget, completePromptText, askSupervisorText, canCompleteStageRole } from '../utils/stageStartGuard'

const STAGE = { id: 7, seq: 2, position: 2, operation: 'Turning' }
afterEach(cleanup)

function setup(props = {}) {
  const onComplete = vi.fn(async () => {})
  const utils = render(
    <StageCompleteControl stage={STAGE} output={500} target={500} accepted={488} role="supervisor" completing={false} onComplete={onComplete} promptKey="log-1|7" {...props} />,
  )
  return { onComplete, ...utils }
}

describe('helpers', () => {
  it('reached = processed >= target (target > 0)', () => {
    expect(stageReachedTarget(500, 500)).toBe(true)
    expect(stageReachedTarget(499, 500)).toBe(false)
    expect(stageReachedTarget(10, 0)).toBe(false)
  })
  it('texts', () => {
    expect(completePromptText({ label: 'Stage 2 – Turning', output: 500, target: 500, accepted: 488 })).toBe(
      'Stage 2 – Turning reached 500 of 500 (accepted 488) -- mark it complete?',
    )
    expect(askSupervisorText({ label: 'Stage 2 – Turning', output: 500, target: 500 })).toBe(
      'Stage 2 – Turning reached 500 of 500 -- ask a supervisor to mark it complete.',
    )
  })
  it('only supervisor / admin', () => {
    expect(['supervisor', 'admin', 'operator', undefined].map(canCompleteStageRole)).toEqual([true, true, false, false])
  })
})

describe('StageCompleteControl', () => {
  it('below target: nothing at all', () => {
    setup({ output: 499 })
    expect(screen.queryByRole('button', { name: /Mark Stage Complete/ })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('supervisor: the prompt opens by itself once, with N of N (accepted M); Not now closes it and it does not come back', async () => {
    const { onComplete, rerender } = setup()
    expect(await screen.findByText('Stage 2 – Turning reached 500 of 500 (accepted 488) -- mark it complete?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(screen.queryByText(/mark it complete\?/)).toBeNull())
    rerender(<StageCompleteControl stage={STAGE} output={510} target={500} accepted={498} role="supervisor" completing={false} onComplete={onComplete} promptKey="log-1|7" />)
    expect(screen.queryByText(/mark it complete\?/)).toBeNull()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('supervisor: the button opens the dialog; Mark Complete calls onComplete', async () => {
    const { onComplete } = setup({ promptKey: '' }) // no auto-prompt without a key
    expect(screen.queryByText(/mark it complete\?/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Mark Stage Complete/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mark Complete' }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
  })

  it('operator: no button, no prompt, an "ask a supervisor" note', () => {
    const { onComplete } = setup({ role: 'operator' })
    expect(screen.queryByRole('button', { name: /Mark Stage Complete/ })).toBeNull()
    expect(screen.queryByText(/mark it complete\?/)).toBeNull()
    expect(screen.getByTestId('ask-supervisor-note').textContent).toBe('Stage 2 – Turning reached 500 of 500 -- ask a supervisor to mark it complete.')
    expect(onComplete).not.toHaveBeenCalled()
  })
})
