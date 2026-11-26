'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { spring } from './motion'

const MotionLink = motion.create(Link)

/** Link del pie: se corre un poco al pasar el mouse. */
export function FooterLink({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <MotionLink
      href={href}
      className="inline-block text-[0.95rem] text-neutral-400 transition-colors duration-200 hover:text-brand"
      whileHover={{ x: 4 }}
      transition={spring.snappy}
    >
      {children}
    </MotionLink>
  )
}

export function SocialButton({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: ReactNode
}) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="flex size-10 items-center justify-center rounded-full bg-white/5 transition-colors duration-200 hover:bg-brand"
      whileHover={{ y: -4, rotate: -6 }}
      whileTap={{ scale: 0.9 }}
      transition={spring.bouncy}
    >
      {children}
    </motion.a>
  )
}
