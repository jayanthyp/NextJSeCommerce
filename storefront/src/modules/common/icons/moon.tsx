import React from "react"

import { IconProps } from "types/icon"

const Moon: React.FC<IconProps> = ({ size = "20", color = "currentColor", ...attributes }) => {
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
      <path d="M17.5 11.2A7.5 7.5 0 1 1 8.8 2.5a6 6 0 0 0 8.7 8.7Z" />
    </svg>
  )
}

export default Moon
