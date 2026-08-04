import { Navbar } from '../components/Navbar'
import { Hero } from '../components/Hero'
import { Features } from '../components/Features'
import { Experience } from '../components/Experience'
import { Assessment } from '../components/Assessment'
import { Growth } from '../components/Growth'
import { Footer } from '../components/Footer'
import { PageNavigator } from '../components/PageNavigator'

export function LandingPage() {
  return (
    <>
      <Navbar />
      <Hero />
      <Features />
      <Experience />
      <Assessment />
      <Growth />
      <Footer />
      <PageNavigator />
    </>
  )
}
