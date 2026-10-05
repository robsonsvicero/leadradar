import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ListField } from '../features/settings/settings-page'

function ControlledListField({ onChange }: { onChange: (value: string) => void }) {
  const [items, setItems] = useState<string[]>([])
  return (
    <ListField
      label="Segmentos prioritários (B2B)"
      value={items}
      onChange={(value) => {
        onChange(value)
        setItems([...new Set(value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean))])
      }}
    />
  )
}

describe('settings list field', () => {
  it('keeps spaces and commas in the text while the controlled list updates', () => {
    const onChange = vi.fn()
    render(<ControlledListField onChange={onChange} />)
    const field = screen.getByLabelText('Segmentos prioritários (B2B)')

    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: 'personal trainer, academias ' } })

    expect(field).toHaveValue('personal trainer, academias ')
    expect(onChange).toHaveBeenLastCalledWith('personal trainer, academias ')
  })

  it('normalizes list spacing when editing ends', () => {
    const onChange = vi.fn()
    render(<ControlledListField onChange={onChange} />)
    const field = screen.getByLabelText('Segmentos prioritários (B2B)')

    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: 'personal trainer, academias ' } })
    fireEvent.blur(field)

    expect(field).toHaveValue('personal trainer, academias')
  })
})
