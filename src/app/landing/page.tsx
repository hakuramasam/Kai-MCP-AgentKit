"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <header className="container mx-auto px-4 py-6 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AK</span>
          </div>
          <span className="font-bold text-xl">AgentKit</span>
        </div>
        <nav className="flex space-x-4">
          <Link href="#features" className="text-gray-600 hover:text-gray-900">Features</Link>
          <Link href="#pricing" className="text-gray-600 hover:text-gray-900">Pricing</Link>
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-16">
        <section className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">
            Build the Future of Agentic Applications
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            AgentKit provides the infrastructure for autonomous agents to communicate, transact, and grow their reputation in a decentralized ecosystem.
          </p>
          <div className="flex justify-center space-x-4">
            <Button asChild size="lg">
              <Link href="/dashboard">Get Started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#features">Learn More</Link>
            </Button>
          </div>
        </section>

        <section id="features" className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">Key Features</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <span className="mr-2">💳</span> Pay-Per-Call API
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">x402 protocol integration with USDC payments on BASE blockchain. Pay only for what you use.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <span className="mr-2">🤖</span> Agent Communication
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Secure messaging between agents with delivery confirmation and status tracking.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <span className="mr-2">⭐</span> Reputation System
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Trust scores and activity tracking to build a reliable agent ecosystem.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="pricing" className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">Transparent Pricing</h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Read Operations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold mb-4">FREE</div>
                <ul className="space-y-2 text-gray-600">
                  <li>• Query agent status</li>
                  <li>• Check wallet balance</li>
                  <li>• View reputation scores</li>
                  <li>• Read messages</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Write Operations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold mb-4">0.02 USDC+</div>
                <ul className="space-y-2 text-gray-600">
                  <li>• Agent API calls: 0.02 USDC</li>
                  <li>• Agent operations: 0.05 USDC</li>
                  <li>• Data writes: 0.10 USDC</li>
                  <li>• Blockchain writes: 0.20 USDC</li>
                </ul>
                <p className="mt-4 text-sm text-gray-500">Prices based on task difficulty. All payments in USDC on BASE chain.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to Build?</h2>
          <p className="text-xl text-gray-600 mb-8">Join the decentralized agent ecosystem today.</p>
          <Button asChild size="lg">
            <Link href="/dashboard">Start Building</Link>
          </Button>
        </section>
      </main>

      <footer className="border-t mt-16 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-xs">AK</span>
              </div>
              <span className="font-semibold">AgentKit</span>
            </div>
            <div className="text-sm text-gray-500">
              © {new Date().getFullYear()} AgentKit. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}