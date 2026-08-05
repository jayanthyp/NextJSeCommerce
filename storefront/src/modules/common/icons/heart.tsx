import React from "react"

import { IconProps } from "types/icon"

const Heart: React.FC<IconProps> = ({
  size = "20",
  color = "currentColor",
  filled = false,
  ...attributes
}: IconProps & { filled?: boolean }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...attributes}
    >
      <path d="M10 17.5s-6.5-4.1-8.5-8.1C.4 6.8 1.6 4 4.4 3.4c1.7-.4 3.4.3 4.4 1.8l1.2 1.7 1.2-1.7c1-1.5 2.7-2.2 4.4-1.8 2.8.6 4 3.4 2.9 6-2 4-8.5 8.1-8.5 8.1Z" />
    </svg>
  )
}

export default Heart
