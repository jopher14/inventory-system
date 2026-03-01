# Inventory System

A short description of your project.

## Table of Contents

- [Installation](#installation)
- [Login and Registration](#LoginandRegistration)
- [User Role](#UserRole)
- [Inventory Table](#InventoryTable)
- [Request Table](#RequestTable)
- [Archive Table](#ArchiveTable)

## Installation

Instructions on how to install dependencies and set up the project.

## LoginandRegistration

- Username: prefred Whole Name
- Password: any kind of string
- Select Position from (Admin, IT, Audit, Manager, Supervisor)

## UserRole

- Admin: can access across the page and navigate all
- IT: can add item for record and check the pending status of the request
- Audit: can check all items, can download csv for paper documentation
- Manager: can approve or reject item request
- Supervisor: can check and add request for the team

## InventoryTable

- Item Name: Item type
- Brand: brand or model of the item
- Serial Number: item serial number
- Date: date that the item added
- Employee User: assigned employee or users
  if Laptop
  - Model: unit model
  - Warranty Expiration: unit warranty
  - CPU: cpu with gen
  - RAM: memory capacity and megahertz
  - Storage size: SSD or HDD
- Export CSV: it export to a csv file only what on the table displayed

## RequestTable

- Item Name
- Brand
- Quantity
- Reason

## ArchiveTable

- Approve: approved with name and date
- Reject: rejected with name and date
