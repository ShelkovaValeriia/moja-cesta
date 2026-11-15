import { useState } from 'react'
import type { ComponentProps } from 'react'
import { useStore } from '../context'
import { Modal, Notice } from './ui'

export function DispatcherModal({
  actionErrors = false,
  children,
  ...props
}: ComponentProps<typeof Modal> & { actionErrors?: boolean }) {
  return (
    <Modal {...props}>
      {children}
      {actionErrors && <ActionError />}
    </Modal>
  )
}

function ActionError() {
  const { toast } = useStore()
  const [initialToast] = useState(toast)
  return toast?.error && toast !== initialToast ? (
    <Notice tone="warning">{toast.message}</Notice>
  ) : null
}
