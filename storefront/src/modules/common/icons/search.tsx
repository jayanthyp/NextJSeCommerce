import React from "react"

import { IconProps } from "types/icon"

const Search: React.FC<IconProps> = ({ size = "20", color = "currentColor", ...attributes }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...attributes}
    >
      <circle cx="8.5" cy="8.5" r="6" />
      <path d="M17 17l-4-4" />
    </svg>
  )
}

export default Search
