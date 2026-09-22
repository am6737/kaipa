import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

type ListSearchProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function ListSearch({
  value,
  onChange,
  placeholder = '搜索列表…',
}: ListSearchProps) {
  return (
    <div className='relative w-full sm:w-auto'>
      <Search className='absolute start-2.5 top-2.5 size-4 text-muted-foreground' />
      <Input
        value={value}
        maxLength={200}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className='h-8 w-full ps-8 sm:w-37.5 lg:w-62.5'
      />
    </div>
  )
}
