import type { Address } from '@/app/lib/tripApi/types';

const money = (value: number | undefined) => value === undefined ? '—' : `$${value.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const labels = ['分攤', '墊付', '筆數'];
const values = (address: Address) => [money(address.statistics?.totalExpense), money(address.statistics?.totalPrepaid), address.statistics?.activeRecordCount ?? '—'];

export function MemberStatistics({ addresses, isValid }: { addresses: Address[]; isValid: boolean }) {
 return <section aria-label='成員統計資料' className='text-gray-700'>
  <p className='mb-3 text-sm text-gray-500'>僅計有效帳目，含轉帳。</p>
  {!isValid && <p role='status' className='mb-3 text-red-500'>已略過無效帳目。</p>}
  {addresses.length === 0 ? <p className='text-center text-gray-500'>尚無成員</p> : <>
   <table className='hidden w-full table-fixed sm:table'>
    <caption className='sr-only'>各成員分攤、墊付與參與統計</caption>
    <thead><tr>{['成員', ...labels].map(label => <th key={label} scope='col' className='p-2 text-left'>{label}</th>)}</tr></thead>
    <tbody>{addresses.map(address => <tr key={address.id} className='border-t'>
     <th scope='row' className='p-2 text-left font-medium [overflow-wrap:anywhere]'>{address.name}</th>
     {values(address).map((value, index) => <td key={labels[index]} className='p-2 tabular-nums [overflow-wrap:anywhere]'>{value}</td>)}
    </tr>)}</tbody>
   </table>
   <div className='space-y-3 sm:hidden'>{addresses.map(address => <article key={address.id} className='rounded-lg bg-gray-50 p-3'>
    <h3 className='mb-2 font-semibold [overflow-wrap:anywhere]'>{address.name}</h3>
    <dl className='space-y-1'>{values(address).map((value, index) => <div key={labels[index]} className='flex justify-between gap-3'>
     <dt className='shrink-0'>{labels[index]}</dt><dd className='min-w-0 text-right tabular-nums [overflow-wrap:anywhere]'>{value}</dd>
    </div>)}</dl>
   </article>)}</div>
  </>}
 </section>;
}
