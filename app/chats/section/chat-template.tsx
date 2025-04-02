"use client"

// ** Imports: React & Hooks **
import React, { useState } from "react"

// ** UI Components **
import {
  SidebarInset,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/app/_components/blocks/sidebar"
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/_components/ui/dropdown-menu"

// ** Icons **
import {
  Brush,
  Camera,
  ChartBarIncreasing,
  ChevronUp,
  CircleFadingPlus,
  CircleOff,
  CircleUserRound,
  File,
  Image,
  ListFilter,
  Menu,
  MessageCircle,
  MessageSquareDashed,
  MessageSquareDot,
  Mic,
  Paperclip,
  Phone,
  Search,
  Send,
  Settings,
  Smile,
  SquarePen,
  Star,
  User,
  User2,
  UserRound,
  Users,
  Video,
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

export const Home = () => {
  const [currentChat, setCurrentChat] = useState(contactList[0])

  return (
    <SidebarInset className="h-[620px]">
      <ResizablePanelGroup direction="horizontal" className="h-full max-h-[620px]">
        {/* Left Panel - Chat List */}
        <ResizablePanel defaultSize={25} minSize={20} className="flex-grow">
          <div className="flex flex-col h-full max-h-[620px] border ml-1">
            <div className="h-10 px-2 py-4 flex items-center">
              <p className="ml-1">Chats</p>
            </div>

            {/* Search Bar */}
            <div className="relative px-2 py-4">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5" />
              <Input
                placeholder="Search or start new chat"
                className="pl-10"
              />
            </div>

            {/* Contact List */}
            <ScrollArea className="flex-grow h-[calc(100%-96px)]">
              {contactList.map((contact, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentChat(contact)}
                  className="px-4 w-full py-2 hover:bg-secondary cursor-pointer text-left"
                >
                  <div className="flex flex-row gap-2">
                    <Avatar className="size-12">
                      <AvatarImage src={contact.image} />
                      <AvatarFallback>{contact.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
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
        <ResizablePanel defaultSize={75} minSize={40}>
          <div className="flex flex-col justify-between h-full max-h-[700px] ml-1 pb-2">
            {/* Chat Header */}
            <div className="h-16 border-b flex items-center px-3">
              <Avatar className="size-12">
                <AvatarImage src={currentChat?.image} />
                <AvatarFallback>PR</AvatarFallback>
              </Avatar>
              <div className="space-y-1 ml-2">
                <CardTitle className="text-md">{currentChat?.name}</CardTitle>
                <CardDescription>Contact Info</CardDescription>
              </div>
              <div className="flex-grow flex justify-end gap-2">
                <Button variant="ghost" size="icon">
                  <Search />
                </Button>
              </div>
            </div>

            {/* Chat Messages Area */}
            <ScrollArea className="flex-grow h-[calc(100%-96px)]">
              {/* Aqui você pode adicionar o conteúdo das mensagens */}
            </ScrollArea>

            {/* Input Area */}
            <div className="flex h-15 rounded-md bg-gray-100">
              <Button variant="ghost" size="icon">
                <Smile />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="ghost" size="icon">
                    <Paperclip />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>
                    <File /> Document
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Input
                className="flex-grow border-0 bg-gray-100"
                placeholder="Type a message"
              />
              <Button variant="ghost" size="icon">
                <Send />
              </Button>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </SidebarInset>
  )
}
