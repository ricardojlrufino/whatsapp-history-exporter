# whatsapp-history-exporter

Tool to export Whatsapp chat history emulating Whatsapp APP, using NodeJS + baileys whatsapp lib.

# Init

> yarn install


## Expor only contacs in list (optional) 

create a file named 'includeList.txt', add numbers , one per line. 

# Extract Messages (to JSON)

> yarn run extract  

# Import JSON chats to Database (optional)

Create .env file with content: 

> DATABASE_URL="mysql://root:root@localhost:3306/whatsapp_db"  

## DB Init / Setup

> yarn prisma generate  
> yarn prisma db push  

## Start export

> yarn run migrate  

