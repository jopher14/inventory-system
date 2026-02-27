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

- Must have Username and Password prefred Whole Name
- Select Position from (Admin, IT, Audit, Manager, Supervisor)

## UserRole

- Admin: can access across the page and navigate all
- IT: can add item for record and check the pending status of the request
- Audit: can check all items, can download csv for paper documentation
- Manager: can approve or reject item request
- Supervisor: can check and add request for the team

## InventoryTable

- Item Name
- Brand
- Serial Number
- Date Added
- Employee User
  if Laptop - Model - Warranty Expiration - CPU - RAM - Storage size
- Export CSV

## RequestTable

- Item Name
- Brand
- Quantity
- Reason

## ArchiveTable

- Approve
- Reject

```bash
# Example
pip install -r requirements.txt
```
