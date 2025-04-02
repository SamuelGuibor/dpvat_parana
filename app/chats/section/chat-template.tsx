"use client"

// ** Imports: React & Hooks **
import React, { useState } from "react"

// ** UI Components **
import { SidebarInset } from "@/app/_components/blocks/sidebar"
import { Button } from "@/app/_components/ui/button"
import { Input } from "@/app/_components/ui/input"
import { ScrollArea } from "@/app/_components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/_components/ui/avatar"
import { CardDescription, CardTitle } from "@/app/_components/ui/card"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/app/_components/ui/resizable"

// ** Dropdown Menu Components **
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/_components/ui/dropdown-menu"

// ** Icons **
import {
  File,
  Paperclip,
  Search,
  Send,
  Smile,
} from "lucide-react"

// ** Contact List **
const contactList = [
  {
    name: "Manoj Rayi",
    message: "Your Last Message Here",
    image: "https://github.com/rayimanoj8.png",
  },
  {
    name: "Anjali Kumar",
    message: "Hello, how are you?",
    image: "https://randomuser.me/api/portraits/women/2.jpg",
  },
  {
    name: "Ravi Teja",
    message: "Looking forward to the meeting.",
    image: "https://randomuser.me/api/portraits/men/3.jpg",
  },
  {
    name: "Sneha Reddy",
    message: "Can you send the report?",
    image: "https://randomuser.me/api/portraits/women/4.jpg",
  },
]

export const Chat = () => {
  const [currentChat, setCurrentChat] = useState(contactList[0])

  return (
    <div className="h-screen flex flex-col"> {/* Altura total da tela */}
      <SidebarInset className="flex-1">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left Panel - Chat List */}
          <ResizablePanel defaultSize={25} minSize={20}>
            <div className="flex flex-col h-full border ml-1">
              <div className="h-12 px-2 py-4 flex items-center">
                <p className="ml-1 text-lg">Chats</p>
              </div>

              {/* Search Bar */}
              <div className="relative px-2 py-4">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-500" />
                <Input
                  placeholder="Search or start new chat"
                  className="pl-10 h-10"
                />
              </div>

              {/* Contact List */}
              <ScrollArea className="flex-1">
                {contactList.map((contact, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentChat(contact)}
                    className="px-4 w-full py-2 hover:bg-secondary cursor-pointer text-left"
                  >
                    <div className="flex flex-row gap-2 items-center">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={contact.image} />
                        <AvatarFallback>{contact.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-1">
                        <CardTitle className="text-md">{contact.name}</CardTitle>
                        <CardDescription>{contact.message}</CardDescription>
                      </div>
                    </div>
                  </button>
                ))}
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle />

          {/* Right Panel - Chat Area */}
          <ResizablePanel defaultSize={75} minSize={40}>
            <div className="flex flex-col h-full ml-1">
              {/* Chat Header */}
              <div className="h-16 border-b flex items-center px-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={currentChat?.image} />
                  <AvatarFallback>PR</AvatarFallback>
                </Avatar>
                <div className="space-y-1 ml-2">
                  <CardTitle className="text-md">{currentChat?.name}</CardTitle>
                  <CardDescription>Contact Info</CardDescription>
                </div>
                <div className="flex-grow flex justify-end gap-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Search className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Chat Messages Area */}
              <ScrollArea className="flex-1">
                {/* Aqui você pode adicionar o conteúdo das mensagens */}
              </ScrollArea>

              {/* Input Area */}
              <div className="flex h-14 px-2 py-2 bg-gray-100 rounded-md">
                <Button variant="ghost" size="icon" className="h-10 w-10">
                  <Smile className="h-5 w-5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-10">
                      <Paperclip className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>
                      <File className="h-5 w-5 mr-2" /> Document
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Input
                  className="flex-1 border-0 bg-gray-100 h-10"
                  placeholder="Type a message"
                />
                <Button variant="ghost" size="icon" className="h-10 w-10">
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </SidebarInset>
    </div>
  )
}