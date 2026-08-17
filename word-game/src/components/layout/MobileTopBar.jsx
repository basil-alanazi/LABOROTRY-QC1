import BrandMark from '../BrandMark'

export default function MobileTopBar() {
  return (
    <div className="md:hidden flex items-center justify-center px-4 pt-4">
      <BrandMark size="sm" />
    </div>
  )
}
